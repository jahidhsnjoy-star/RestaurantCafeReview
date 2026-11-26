const assert = require('node:assert/strict');
const http = require('node:http');
const {after, before, test} = require('node:test');
const express = require('express');

const db = require('../config/db');

const nativeFetch = global.fetch;
const sentCodes = new Map();
let providerRejectRecipient = false;
let server;
let apiBaseUrl;
const testEmails = [];

const request = async (path, body, {method = 'POST', token} = {}) => {
  const response = await nativeFetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
    body: JSON.stringify(body),
  });
  return {status: response.status, body: await response.json()};
};

before(async () => {
  process.env.RESEND_API_KEY = 'test-key-not-used-for-network';
  process.env.EMAIL_FROM = 'test@example.test';
  process.env.EMAIL_FROM = 'test@example.test';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const message = JSON.parse(options.body);
    if (providerRejectRecipient) {
      return new Response(JSON.stringify({
        message: 'You can only send testing emails to your own email address',
      }), {status: 403});
    }
    const code = message.text.match(/\b\d{6}\b/)?.[0];
    assert.ok(code);
    sentCodes.set(message.to[0], code);
    return new Response(JSON.stringify({id: 'test-email-id'}), {status: 200});
  };

  const app = express();
  app.use(express.json());
  app.use('/api/users', require('../routes/userRoutes'));
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  apiBaseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = nativeFetch;
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  if (testEmails.length > 0) {
    const placeholders = testEmails.map(() => '?').join(', ');
    await db.promise().execute(
      `DELETE FROM users WHERE email IN (${placeholders})`,
      testEmails,
    );
    await db.promise().execute(
      `DELETE FROM pending_user_registrations WHERE email IN (${placeholders})`,
      testEmails,
    );
  }
  await db.end();
});

test('email OTP registration validates, expires, limits, and completes account creation', async () => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const email = `otp${suffix}@example.test`;
  testEmails.push(email);
  const username = `otp_${suffix}`.slice(0, 30);
  const password = 'TestPassword123';
  process.env.EMAIL_FROM = 'onboarding@resend.dev';
  process.env.RESEND_TEST_RECIPIENT = `owner${suffix}@example.test`;
  const blockedRecipient = await request('/api/users/registration/start', {
    name: 'Blocked Test',
    username: `blocked_${suffix}`.slice(0, 30),
    email: `other${suffix}@example.test`,
    password,
  });
  assert.equal(blockedRecipient.status, 403);
  assert.match(blockedRecipient.body.message, /configured verified account-owner email/);
  process.env.EMAIL_FROM = 'test@example.test';

  const rejectedEmail = `rej${suffix}@example.test`;
  testEmails.push(rejectedEmail);
  providerRejectRecipient = true;
  const rejected = await request('/api/users/registration/start', {
    name: 'Rejected Test',
    username: `rej_${suffix}`.slice(0, 30),
    email: rejectedEmail,
    password,
  });
  providerRejectRecipient = false;
  assert.equal(rejected.status, 403);
  assert.match(rejected.body.message, /verified email address on your Resend account/);
  assert.equal('verificationId' in rejected.body, false);

  const start = await request('/api/users/registration/start', {
    name: 'OTP Test',
    username,
    email,
    password,
  });

  assert.equal(start.status, 202);
  assert.equal(typeof start.body.verificationId, 'string');
  assert.equal('otp' in start.body, false);

  const registrationId = start.body.verificationId;
  const firstCode = sentCodes.get(email);
  assert.match(firstCode, /^\d{6}$/);
  const incorrectCode = firstCode === '000000' ? '000001' : '000000';

  const wrongPendingPassword = await request('/api/users/registration/start', {
    name: 'OTP Test',
    username,
    email,
    password: 'DifferentPassword123',
  });
  assert.equal(wrongPendingPassword.status, 409);
  assert.equal('verificationId' in wrongPendingPassword.body, false);

  const sameRegistration = await request('/api/users/registration/start', {
    name: 'OTP Test',
    username,
    email,
    password,
  });
  assert.equal(sameRegistration.status, 200);
  assert.equal(sameRegistration.body.verificationId, registrationId);

  const [storedOtp] = await db.promise().execute(
    'SELECT otp_hash, password_hash FROM pending_user_registrations WHERE registration_id = ?',
    [registrationId],
  );
  assert.notEqual(storedOtp[0].otp_hash.toString(), firstCode);
  assert.notEqual(storedOtp[0].password_hash, password);

  const incorrect = await request('/api/users/registration/verify-otp', {
    verificationId: registrationId,
    otp: incorrectCode,
  });
  assert.equal(incorrect.status, 400);
  assert.equal(incorrect.body.message, 'Incorrect verification code');

  const cooldown = await request('/api/users/registration/resend-otp', {
    verificationId: registrationId,
  });
  assert.equal(cooldown.status, 429);

  await db.promise().execute(
    'UPDATE pending_user_registrations SET resend_after = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE registration_id = ?',
    [registrationId],
  );
  const resent = await request('/api/users/registration/resend-otp', {
    verificationId: registrationId,
  });
  assert.equal(resent.status, 200);
  assert.equal(typeof resent.body.resendAfterSeconds, 'number');

  const correct = await request('/api/users/registration/verify-otp', {
    verificationId: registrationId,
    otp: sentCodes.get(email),
  });
  assert.equal(correct.status, 200);

  const [registeredUsers] = await db.promise().execute(
    'SELECT email_verified FROM users WHERE email = ?',
    [email],
  );
  assert.equal(registeredUsers.length, 1);
  assert.equal(registeredUsers[0].email_verified, 1);

  const duplicate = await request('/api/users/registration/start', {
    name: 'Duplicate',
    username: `dup_${suffix}`.slice(0, 30),
    email,
    password,
  });
  assert.equal(duplicate.status, 409);

  const loginResponse = await nativeFetch(`${apiBaseUrl}/api/users/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email, password}),
  });
  assert.equal(loginResponse.status, 200);
  const loggedInUser = await loginResponse.json();
  assert.equal(typeof loggedInUser.token, 'string');
  assert.equal(loggedInUser.username, username);

  const secondEmail = `edit${suffix}@example.test`;
  const secondUsername = `edit_${suffix}`.slice(0, 30);
  testEmails.push(secondEmail);
  const secondRegistration = await request('/api/users/registration/start', {
    name: 'Profile Edit Test',
    username: secondUsername,
    email: secondEmail,
    password,
  });
  assert.equal(secondRegistration.status, 202);
  const secondVerification = await request('/api/users/registration/verify-otp', {
    verificationId: secondRegistration.body.verificationId,
    otp: sentCodes.get(secondEmail),
  });
  assert.equal(secondVerification.status, 200);
  const secondLogin = await nativeFetch(`${apiBaseUrl}/api/users/login`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: secondEmail, password}),
  });
  assert.equal(secondLogin.status, 200);
  const secondUser = await secondLogin.json();

  const unauthenticatedUpdate = await request(
    '/api/users/me',
    {name: 'No Token', username: 'no_token'},
    {method: 'PUT'},
  );
  assert.equal(unauthenticatedUpdate.status, 401);

  const updatedUsername = `updated_${suffix}`.slice(0, 30);
  const profileUpdate = await request(
    '/api/users/me',
    {
      user_id: secondUser.user_id,
      name: 'Updated OTP Test',
      username: updatedUsername,
      email: 'must-not-change@example.test',
    },
    {method: 'PUT', token: loggedInUser.token},
  );
  assert.equal(profileUpdate.status, 200);
  assert.equal(profileUpdate.body.user.user_id, loggedInUser.user_id);
  assert.equal(profileUpdate.body.user.name, 'Updated OTP Test');
  assert.equal(profileUpdate.body.user.username, updatedUsername);
  assert.equal(profileUpdate.body.user.email, email);

  const duplicateUsernameUpdate = await request(
    '/api/users/me',
    {name: 'Profile Edit Test', username: updatedUsername},
    {method: 'PUT', token: secondUser.token},
  );
  assert.equal(duplicateUsernameUpdate.status, 409);

  const expiredEmail = `exp${suffix}@example.test`;
  testEmails.push(expiredEmail);
  const expiredStart = await request('/api/users/registration/start', {
    name: 'Expired Test',
    username: `exp_${suffix}`.slice(0, 30),
    email: expiredEmail,
    password,
  });
  assert.equal(expiredStart.status, 202);
  await db.promise().execute(
    'UPDATE pending_user_registrations SET otp_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE registration_id = ?',
    [expiredStart.body.verificationId],
  );
  const expired = await request('/api/users/registration/verify-otp', {
    verificationId: expiredStart.body.verificationId,
    otp: sentCodes.get(expiredEmail),
  });
  assert.equal(expired.status, 410);

  const limitedEmail = `lim${suffix}@example.test`;
  testEmails.push(limitedEmail);
  const limitedStart = await request('/api/users/registration/start', {
    name: 'Attempt Limit Test',
    username: `lim_${suffix}`.slice(0, 30),
    email: limitedEmail,
    password,
  });
  assert.equal(limitedStart.status, 202);
  const limitedCorrectCode = sentCodes.get(limitedEmail);
  const limitedWrongCode = limitedCorrectCode === '000000' ? '000001' : '000000';
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await request('/api/users/registration/verify-otp', {
      verificationId: limitedStart.body.verificationId,
      otp: limitedWrongCode,
    });
    assert.equal(result.status, attempt === 4 ? 429 : 400);
  }

});

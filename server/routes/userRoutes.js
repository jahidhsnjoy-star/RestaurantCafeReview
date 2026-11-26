const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {promisify} = require('util');
const router = express.Router();

const db = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');
const scrypt = promisify(crypto.scrypt);

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidUsername = (username) => /^[a-z0-9_]{3,30}$/.test(username);
const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

const hashOtp = (otp, salt) => scrypt(otp, salt, 64);

const isResendTestingMode = () =>
  typeof process.env.EMAIL_FROM === 'string' &&
  process.env.EMAIL_FROM.trim().toLowerCase() === 'onboarding@resend.dev';

const isEmailDeliveryConfigured = () =>
  Boolean(
    process.env.RESEND_API_KEY &&
    process.env.EMAIL_FROM &&
    (!isResendTestingMode() || process.env.RESEND_TEST_RECIPIENT),
  );

const sendVerificationEmail = async (email, otp) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Verify your Restaurant & Café Review account',
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your Restaurant &amp; Café Review verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 5 minutes. If you did not request it, ignore this email.</p>`,
    }),
  });

  if (!response.ok) {
    console.error(`Email provider rejected verification email (HTTP ${response.status})`);
    const body = await response.json().catch(() => ({}));
    const providerMessage = [
      body.message,
      body.error,
      body.name,
    ].filter(value => typeof value === 'string').join(' ');

    if (
      response.status === 403 &&
      /testing emails to your own email|resend\.dev/i.test(providerMessage)
    ) {
      const error = new Error('RESEND_TEST_RECIPIENT_REJECTED');
      error.code = 'RESEND_TEST_RECIPIENT_REJECTED';
      throw error;
    }

    throw new Error('Email delivery failed');
  }
};

const registrationInput = (body) => {
  body = body && typeof body === 'object' ? body : {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const username = typeof body.username === 'string'
    ? body.username.trim().toLowerCase()
    : '';
  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || name.length > 100) {
    return {error: 'Name is required and must be 100 characters or fewer'};
  }
  if (!isValidUsername(username)) {
    return {error: 'Username must be 3-30 characters using letters, numbers, or underscores'};
  }
  if (!isValidEmail(email) || email.length > 150) {
    return {error: 'Please provide a valid email address'};
  }
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return {error: 'Password must be at least 8 characters and no more than 72 bytes'};
  }

  return {name, username, email, password};
};

const startRegistration = async (req, res) => {
  const input = registrationInput(req.body);
  if (input.error) {
    return res.status(400).json({message: input.error});
  }
  if (!isEmailDeliveryConfigured()) {
    return res.status(503).json({message: 'Email verification is not configured on the server'});
  }

  const {name, username, email, password} = input;
  if (
    isResendTestingMode() &&
    email !== process.env.RESEND_TEST_RECIPIENT.trim().toLowerCase()
  ) {
    return res.status(403).json({
      message: 'Resend testing mode is restricted to the configured verified account-owner email.',
    });
  }

  let connection;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    await connection.execute(
      'DELETE FROM pending_user_registrations WHERE otp_expires_at <= UTC_TIMESTAMP()',
    );

    const [existingUsers] = await connection.execute(
      'SELECT user_id, email, username FROM users WHERE email = ? OR username = ? LIMIT 1',
      [email, username],
    );
    if (existingUsers.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        message: existingUsers.some(user => user.email.toLowerCase() === email)
          ? 'An account with this email already exists'
          : 'Username already taken',
      });
    }

    const [pendingRows] = await connection.execute(
      `SELECT registration_id, email, username, password_hash,
        GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), resend_after)) AS resend_seconds
       FROM pending_user_registrations
       WHERE email = ? OR username = ?
       LIMIT 1
       FOR UPDATE`,
      [email, username],
    );

    if (pendingRows.length > 0) {
      const pending = pendingRows[0];
      await connection.commit();
      if (pending.email !== email || pending.username !== username) {
        return res.status(409).json({
          message: pending.email === email
            ? 'Username already reserved by a pending registration'
            : 'Email already has a pending registration',
        });
      }
      if (!(await bcrypt.compare(password, pending.password_hash))) {
        return res.status(409).json({
          message: 'A pending registration already exists. Retry with the original registration details.',
        });
      }

      return res.status(200).json({
        message: 'A verification code has already been sent',
        verificationId: pending.registration_id,
        resendAfterSeconds: Number(pending.resend_seconds),
      });
    }

    const registrationId = crypto.randomUUID();
    const otp = String(crypto.randomInt(100000, 1000000));
    const otpSalt = crypto.randomBytes(16);
    const otpHash = await hashOtp(otp, otpSalt);
    const passwordHash = await bcrypt.hash(password, 12);

    await connection.execute(
      `INSERT INTO pending_user_registrations
        (registration_id, name, username, email, password_hash, otp_hash,
         otp_salt, otp_expires_at, resend_after, attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
         DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), 0)`,
      [
        registrationId,
        name,
        username,
        email,
        passwordHash,
        otpHash,
        otpSalt,
        OTP_TTL_SECONDS,
        OTP_RESEND_SECONDS,
      ],
    );
    await connection.commit();

    try {
      await sendVerificationEmail(email, otp);
    } catch (error) {
      await db.promise().execute(
        'DELETE FROM pending_user_registrations WHERE registration_id = ?',
        [registrationId],
      );
      if (error.code === 'RESEND_TEST_RECIPIENT_REJECTED') {
        return res.status(403).json({
          message: 'Resend testing mode only allows delivery to the verified email address on your Resend account. Use that address or verify a sending domain.',
        });
      }
      return res.status(502).json({message: 'Could not send verification email. Please try again later.'});
    }

    return res.status(202).json({
      message: 'Verification code sent',
      verificationId: registrationId,
      resendAfterSeconds: OTP_RESEND_SECONDS,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({message: 'Email or username already registered or pending'});
    }

    console.error('Error starting registration:', error.code || 'database error');
    return res.status(500).json({message: 'Could not start registration. Please try again later.'});
  } finally {
    connection?.release();
  }
};

router.get('/check-username', async (req, res) => {
  const username = typeof req.query.username === 'string'
    ? req.query.username.trim().toLowerCase()
    : '';

  if (!isValidUsername(username)) {
    return res.status(400).json({
      message: 'Username must be 3-30 characters using letters, numbers, or underscores',
    });
  }

  try {
    const [existingUsers] = await db.promise().execute(
      `SELECT user_id FROM users WHERE username = ?
       UNION ALL
       SELECT registration_id FROM pending_user_registrations WHERE username = ?
       LIMIT 1`,
      [username, username],
    );

    return res.json({available: existingUsers.length === 0});
  } catch (error) {
    console.error('Error checking username availability:', error);
    return res.status(500).json({message: 'Could not check username availability'});
  }
});

router.post('/registration/start', startRegistration);
router.post('/register', startRegistration);

router.post('/registration/resend-otp', async (req, res) => {
  const registrationId = typeof req.body?.verificationId === 'string'
    ? req.body.verificationId
    : '';
  if (!/^[0-9a-f-]{36}$/i.test(registrationId)) {
    return res.status(400).json({message: 'A valid verification request is required'});
  }
  if (!isEmailDeliveryConfigured()) {
    return res.status(503).json({message: 'Email verification is not configured on the server'});
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT email, attempts,
        GREATEST(0, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), resend_after)) AS resend_seconds,
        otp_expires_at <= UTC_TIMESTAMP() AS expired
       FROM pending_user_registrations
       WHERE registration_id = ?
       FOR UPDATE`,
      [registrationId],
    );
    const pending = rows[0];
    if (!pending) {
      await connection.rollback();
      return res.status(404).json({message: 'Verification request not found or expired'});
    }
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await connection.rollback();
      return res.status(429).json({message: 'Too many verification attempts. Start registration again later.'});
    }
    if (Number(pending.resend_seconds) > 0) {
      await connection.rollback();
      return res.status(429).json({
        message: 'Please wait before requesting another code',
        resendAfterSeconds: Number(pending.resend_seconds),
      });
    }

    const otp = String(crypto.randomInt(100000, 1000000));
    const otpSalt = crypto.randomBytes(16);
    const otpHash = await hashOtp(otp, otpSalt);
    await connection.execute(
      `UPDATE pending_user_registrations
       SET otp_hash = ?, otp_salt = ?,
           otp_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND),
           resend_after = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
       WHERE registration_id = ?`,
      [otpHash, otpSalt, OTP_TTL_SECONDS, OTP_RESEND_SECONDS, registrationId],
    );
    await connection.commit();

    try {
      await sendVerificationEmail(pending.email, otp);
    } catch (error) {
      if (error.code === 'RESEND_TEST_RECIPIENT_REJECTED') {
        return res.status(403).json({
          message: 'Resend testing mode only allows delivery to the verified email address on your Resend account. Use that address or verify a sending domain.',
        });
      }
      return res.status(502).json({message: 'Could not send verification email. Please try again later.'});
    }

    return res.json({
      message: 'A new verification code was sent',
      resendAfterSeconds: OTP_RESEND_SECONDS,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    console.error('Error resending verification email:', error.code || 'database error');
    return res.status(500).json({message: 'Could not resend verification email'});
  } finally {
    connection?.release();
  }
});

router.post('/registration/verify-otp', async (req, res) => {
  const registrationId = typeof req.body?.verificationId === 'string'
    ? req.body.verificationId
    : '';
  const otp = typeof req.body?.otp === 'string' ? req.body.otp : '';
  if (!/^[0-9a-f-]{36}$/i.test(registrationId) || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({message: 'A valid verification request and six-digit code are required'});
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT *, otp_expires_at <= UTC_TIMESTAMP() AS expired
       FROM pending_user_registrations
       WHERE registration_id = ?
       FOR UPDATE`,
      [registrationId],
    );
    const pending = rows[0];
    if (!pending) {
      await connection.rollback();
      return res.status(404).json({message: 'Verification request not found'});
    }
    if (pending.expired) {
      await connection.execute(
        'DELETE FROM pending_user_registrations WHERE registration_id = ?',
        [registrationId],
      );
      await connection.commit();
      return res.status(410).json({message: 'Verification code expired. Start registration again.'});
    }
    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await connection.rollback();
      return res.status(429).json({message: 'Too many incorrect codes. Start registration again later.'});
    }

    const submittedHash = await hashOtp(otp, pending.otp_salt);
    if (!crypto.timingSafeEqual(submittedHash, pending.otp_hash)) {
      const attempts = Number(pending.attempts) + 1;
      await connection.execute(
        'UPDATE pending_user_registrations SET attempts = ? WHERE registration_id = ?',
        [attempts, registrationId],
      );
      await connection.commit();
      return res.status(attempts >= MAX_OTP_ATTEMPTS ? 429 : 400).json({
        message: attempts >= MAX_OTP_ATTEMPTS
          ? 'Too many incorrect codes. Start registration again later.'
          : 'Incorrect verification code',
      });
    }

    await connection.execute(
      `INSERT INTO users (name, username, email, password, role, email_verified)
       VALUES (?, ?, ?, ?, 'user', 1)`,
      [pending.name, pending.username, pending.email, pending.password_hash],
    );
    await connection.execute(
      'DELETE FROM pending_user_registrations WHERE registration_id = ?',
      [registrationId],
    );
    await connection.commit();

    return res.json({message: 'Email verified and registration completed'});
  } catch (error) {
    if (connection) {
      await connection.rollback().catch(() => {});
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({message: 'Email or username is already registered'});
    }
    console.error('Error verifying email:', error.code || 'database error');
    return res.status(500).json({message: 'Could not verify email. Please try again.'});
  } finally {
    connection?.release();
  }
});

router.post('/login', async (req, res) => {
  const email = typeof req.body.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    return res.status(400).json({message: 'A valid email and password are required'});
  }

  try {
    const [users] = await db.promise().execute(
      'SELECT user_id, name, username, email, password, role, email_verified FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({message: 'Email or password is incorrect'});
    }

    if (!user.email_verified) {
      return res.status(403).json({message: 'Please verify your email before signing in'});
    }

    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({message: 'Authentication is not configured on the server'});
    }

    const userId = Number(user.user_id);
    const token = jwt.sign(
      {user_id: userId, role: user.role},
      process.env.JWT_SECRET,
      {expiresIn: '7d'},
    );

    return res.json({
      message: 'Login successful',
      token,
      user_id: userId,
      name: user.name,
      username: user.username ?? null,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).json({message: 'Login failed. Please try again later'});
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const username = typeof req.body?.username === 'string'
    ? req.body.username.trim().toLowerCase()
    : '';

  if (!name || name.length > 100) {
    return res.status(400).json({
      message: 'Name is required and must be 100 characters or fewer',
    });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({
      message: 'Username must be 3-30 characters using letters, numbers, or underscores',
    });
  }

  try {
    const userId = req.user.user_id;
    const [existingUsers] = await db.promise().execute(
      'SELECT user_id FROM users WHERE username = ? AND user_id <> ? LIMIT 1',
      [username, userId],
    );
    if (existingUsers.length > 0) {
      return res.status(409).json({message: 'Username already taken'});
    }

    await db.promise().execute(
      'UPDATE users SET name = ?, username = ? WHERE user_id = ?',
      [name, username, userId],
    );
    const [users] = await db.promise().execute(
      `SELECT user_id, name, username, email, role
       FROM users WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    if (users.length === 0) {
      return res.status(404).json({message: 'User not found'});
    }

    return res.json({message: 'Profile updated successfully', user: users[0]});
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({message: 'Username already taken'});
    }
    console.error('Error updating user profile:', error.code || 'database error');
    return res.status(500).json({
      message: 'Could not update your profile. Please try again.',
    });
  }
});

router.get('/:id', authenticateToken, (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: 'A valid user_id is required',
    });
  }

  if (userId !== req.user.user_id) {
    return res.status(403).json({message: 'You can only access your own profile'});
  }

  const sql = `
    SELECT user_id, name, username, email, 'user' AS role
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user profile:', err);

      return res.status(500).json({
        message: 'Failed to fetch user profile',
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    res.json(results[0]);
  });
});

module.exports = router;
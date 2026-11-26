const assert = require('node:assert/strict');
const {afterEach, beforeEach, mock, test} = require('node:test');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'review-image-test-secret';

const mysql = require('mysql2');
const testPool = {
  query() {},
  getConnection(callback) {
    callback(null, {release() {}});
  },
  end(callback) {
    callback();
  },
};
mysql.createPool = () => testPool;

const db = require('../config/db');
const reviewImageStorage = require('../config/cloudinary');
const restaurantRoutes = require('../routes/restaurantRoutes');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZcAAAAASUVORK5CYII=',
  'base64',
);

let server;
let queryCalls;
let uploadCalls;
let deleteCalls;
let ownedReview;
let cloudUploadFailure;

const makeToken = userId =>
  jwt.sign({user_id: userId}, process.env.JWT_SECRET);

const multipartRequest = async (path, method, fields, file, token = makeToken(7)) => {
  const boundary = `----review-image-test-${Date.now()}`;
  const chunks = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ));
  }
  if (file) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${file.name}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    ));
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  const body = Buffer.concat(chunks);
  return sendRequest(path, method, body, token, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  });
};

const jsonRequest = (path, method, body, token = makeToken(7)) =>
  sendRequest(
    path,
    method,
    Buffer.from(JSON.stringify(body)),
    token,
    {'Content-Type': 'application/json'},
  );

const sendRequest = (path, method, body, token, headers = {}) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: `/api/restaurants/1/reviews${path}`,
        method,
        agent: false,
        headers: {
          ...headers,
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
          'Content-Length': body.length,
        },
      },
      response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: response.statusCode,
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
      },
    );

    request.on('error', reject);
    request.end(body);
  });

const validImage = {
  buffer: png,
  mimeType: 'image/png',
  name: 'review.png',
};

beforeEach(async () => {
  queryCalls = [];
  uploadCalls = [];
  deleteCalls = [];
  cloudUploadFailure = false;
  ownedReview = {
    review_id: 12,
    image_url: 'https://res.cloudinary.com/test/old.jpg',
    cloudinary_public_id: 'reviews/owned-old',
  };

  mock.method(db, 'query', (sql, values, callback) => {
    queryCalls.push({sql, values});
    if (/INSERT INTO reviews/.test(sql)) {
      callback(null, {insertId: 27, affectedRows: 1});
    } else if (/SELECT review_id/.test(sql)) {
      callback(null, ownedReview ? [ownedReview] : []);
    } else if (/UPDATE reviews/.test(sql) || /DELETE FROM reviews/.test(sql)) {
      callback(null, {affectedRows: 1});
    } else {
      callback(new Error('Unexpected database query'));
    }
  });

  mock.method(reviewImageStorage, 'uploadReviewImage', async buffer => {
    uploadCalls.push(buffer);
    if (cloudUploadFailure) {
      throw new Error('private provider error');
    }
    return {
      imageUrl: 'https://res.cloudinary.com/test/new-image.jpg',
      publicId: 'reviews/new-image',
    };
  });
  mock.method(reviewImageStorage, 'deleteReviewImage', async publicId => {
    deleteCalls.push(publicId);
    return true;
  });

  const app = express();
  app.use(express.json());
  app.use('/api/restaurants', restaurantRoutes);
  server = app.listen(0, '127.0.0.1');
  server.unref();
  await new Promise(resolve => server.once('listening', resolve));
});

afterEach(() => {
  mock.restoreAll();
  if (server) {
    const activeServer = server;
    server = null;
    activeServer.closeAllConnections();
    activeServer.close();
  }
});

test('requires authentication before accepting review images', async () => {
  const response = await multipartRequest('', 'POST', {rating: '5'}, validImage, null);

  assert.equal(response.status, 401);
  assert.equal(uploadCalls.length, 0);
  assert.equal(queryCalls.length, 0);
});

test('creates an authenticated review with an image and returns its secure metadata', async () => {
  const response = await multipartRequest('', 'POST', {
    rating: '5',
    review_text: 'Excellent food',
  }, validImage);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.review_id, 27);
  assert.equal(body.image_url, 'https://res.cloudinary.com/test/new-image.jpg');
  assert.equal(body.cloudinary_public_id, 'reviews/new-image');
  assert.equal(uploadCalls.length, 1);
  assert.equal(queryCalls[0].values[4], body.image_url);
  assert.equal(queryCalls[0].values[5], body.cloudinary_public_id);
});

test('creates a review without an image and keeps image columns null', async () => {
  const response = await jsonRequest('', 'POST', {rating: 4, review_text: 'Good'});

  assert.equal(response.status, 201);
  assert.equal(uploadCalls.length, 0);
  assert.equal(queryCalls[0].values[4], null);
  assert.equal(queryCalls[0].values[5], null);
});

test('rejects invalid MIME types, mismatched image contents, and oversized images', async t => {
  await t.test('rejects a non-image MIME type', async () => {
    const response = await multipartRequest('', 'POST', {rating: '5'}, {
      buffer: Buffer.from('not an image'),
      mimeType: 'text/plain',
      name: 'notes.txt',
    });

    assert.equal(response.status, 415);
  });

  await t.test('rejects content that does not match the declared MIME type', async () => {
    const response = await multipartRequest('', 'POST', {rating: '5'}, {
      ...validImage,
      mimeType: 'image/jpeg',
    });

    assert.equal(response.status, 415);
  });

  await t.test('rejects an image larger than 5 MB', async () => {
    const oversizedImage = {
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
      mimeType: 'image/png',
      name: 'large.png',
    };
    const response = await multipartRequest('', 'POST', {rating: '5'}, oversizedImage);

    assert.equal(response.status, 413);
  });

  assert.equal(uploadCalls.length, 0);
  assert.equal(queryCalls.length, 0);
});

test('does not upload or update a review owned by another user', async () => {
  ownedReview = null;
  const response = await multipartRequest('/12', 'PUT', {
    rating: '5',
    review_text: 'Attempt to modify another review',
  }, validImage);

  assert.equal(response.status, 404);
  assert.equal(uploadCalls.length, 0);
  assert.equal(queryCalls.length, 1);
});

test("does not delete another user's review or its image", async () => {
  ownedReview = null;
  const response = await jsonRequest('/12', 'DELETE', {});

  assert.equal(response.status, 404);
  assert.equal(queryCalls.length, 1);
  assert.equal(deleteCalls.length, 0);
});

test('replaces an owned review image and deletes only its stored old asset', async () => {
  const response = await multipartRequest('/12', 'PUT', {
    rating: '4',
    review_text: 'Updated review',
  }, validImage);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.image_url, 'https://res.cloudinary.com/test/new-image.jpg');
  assert.equal(queryCalls[1].values[2], body.image_url);
  assert.equal(queryCalls[1].values[3], 'reviews/new-image');
  assert.deepEqual(deleteCalls, ['reviews/owned-old']);
});

test('removes an owned review image without accepting a client public ID', async () => {
  const response = await multipartRequest(
    '/12?cloudinary_public_id=reviews%2Farbitrary-client-value',
    'PUT',
    {
    rating: '4',
    review_text: 'Photo removed',
    remove_image: 'true',
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(queryCalls[1].values[2], null);
  assert.equal(queryCalls[1].values[3], null);
  assert.deepEqual(deleteCalls, ['reviews/owned-old']);
  assert.equal(body.image_url, null);
});

test('deletes an owned review and cleans up its stored Cloudinary image', async () => {
  const response = await jsonRequest('/12', 'DELETE', {
    cloudinary_public_id: 'reviews/arbitrary-client-value',
  });

  assert.equal(response.status, 200);
  assert.deepEqual(deleteCalls, ['reviews/owned-old']);
  assert.match(queryCalls[1].sql, /DELETE FROM reviews/);
});

test('returns a safe error when Cloudinary upload fails', async () => {
  cloudUploadFailure = true;

  const response = await multipartRequest('', 'POST', {rating: '5'}, validImage);

  assert.equal(response.status, 502);
  assert.equal(queryCalls.length, 0);
  assert.doesNotMatch(await response.text(), /private provider error/);
});

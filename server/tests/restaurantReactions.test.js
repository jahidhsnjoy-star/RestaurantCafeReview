const assert = require('node:assert/strict');
const {afterEach, beforeEach, mock, test} = require('node:test');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'restaurant-reactions-test-secret';

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
const restaurantRoutes = require('../routes/restaurantRoutes');

let server;
let reactions;

const makeToken = userId =>
  jwt.sign({user_id: userId}, process.env.JWT_SECRET);

const request = (path, method, body, userId = 7) =>
  new Promise((resolve, reject) => {
    const serializedBody = body === undefined ? '' : JSON.stringify(body);
    const token = userId === null ? null : makeToken(userId);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path: `/api/restaurants${path}`,
        method,
        agent: false,
        headers: {
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
          ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
          'Content-Length': Buffer.byteLength(serializedBody),
        },
      },
      res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode,
            json: () => JSON.parse(text),
          });
        });
      },
    );

    req.on('error', reject);
    req.end(serializedBody);
  });

beforeEach(async () => {
  reactions = [];
  mock.method(db, 'query', (sql, values, callback) => {
    if (/SELECT restaurant_id FROM restaurants/.test(sql)) {
      callback(null, values[0] === 1 ? [{restaurant_id: 1}] : []);
      return;
    }

    if (/INSERT INTO restaurant_reactions/.test(sql)) {
      const [userId, restaurantId, reactionType] = values;
      const existing = reactions.find(
        reaction =>
          reaction.userId === userId && reaction.restaurantId === restaurantId,
      );
      if (existing) {
        existing.reactionType = reactionType;
      } else {
        reactions.push({userId, restaurantId, reactionType});
      }
      callback(null, {affectedRows: 1});
      return;
    }

    if (/DELETE FROM restaurant_reactions/.test(sql)) {
      const [userId, restaurantId] = values;
      reactions = reactions.filter(
        reaction =>
          reaction.userId !== userId || reaction.restaurantId !== restaurantId,
      );
      callback(null, {affectedRows: 1});
      return;
    }

    if (/COUNT\(CASE WHEN reaction_type/.test(sql)) {
      const [userId, restaurantId] = values;
      const matching = reactions.filter(
        reaction => reaction.restaurantId === restaurantId,
      );
      callback(null, [{
        like_count: matching.filter(item => item.reactionType === 'like').length,
        dislike_count: matching.filter(item => item.reactionType === 'dislike').length,
        user_reaction:
          matching.find(item => item.userId === userId)?.reactionType ?? null,
      }]);
      return;
    }

    callback(new Error('Unexpected database query'));
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

test('requires authentication and rejects invalid or missing restaurants', async () => {
  const unauthenticated = await request('/1/reaction', 'PUT', {reaction: 'like'}, null);
  assert.equal(unauthenticated.status, 401);
  assert.equal(reactions.length, 0);

  const malformedId = await request('/abc/reaction', 'PUT', {reaction: 'like'});
  assert.equal(malformedId.status, 400);

  const missingRestaurant = await request('/999/reaction', 'PUT', {reaction: 'like'});
  assert.equal(missingRestaurant.status, 404);

  const invalidReaction = await request('/1/reaction', 'PUT', {reaction: 'love'});
  assert.equal(invalidReaction.status, 400);
});

test('supports likes, dislikes, switching, removal, and idempotent repeated taps', async () => {
  let response = await request('/1/reaction', 'PUT', {reaction: 'like'});
  assert.equal(response.status, 200);
  assert.deepEqual(response.json(), {
    like_count: 1,
    dislike_count: 0,
    user_reaction: 'like',
  });

  response = await request('/1/reaction', 'PUT', {reaction: 'like'});
  assert.deepEqual(response.json(), {
    like_count: 1,
    dislike_count: 0,
    user_reaction: 'like',
  });
  assert.equal(reactions.length, 1);

  response = await request('/1/reaction', 'PUT', {reaction: 'dislike'});
  assert.deepEqual(response.json(), {
    like_count: 0,
    dislike_count: 1,
    user_reaction: 'dislike',
  });

  response = await request('/1/reaction', 'DELETE');
  assert.deepEqual(response.json(), {
    like_count: 0,
    dislike_count: 0,
    user_reaction: null,
  });
  assert.equal(reactions.length, 0);
});

test('keeps reactions independent between users and returns global counts', async () => {
  await request('/1/reaction', 'PUT', {reaction: 'like'}, 7);
  const response = await request('/1/reaction', 'PUT', {reaction: 'dislike'}, 8);

  assert.deepEqual(response.json(), {
    like_count: 1,
    dislike_count: 1,
    user_reaction: 'dislike',
  });
  assert.equal(reactions.length, 2);
});

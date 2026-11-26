const assert = require('node:assert/strict');
const {afterEach, beforeEach, mock, test} = require('node:test');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'graphql-test-secret';

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
const graphqlRoutes = require('../routes/graphqlRoutes');
const restaurantRoutes = require('../routes/restaurantRoutes');

let server;
let insertedReview;
let paginationValues;

const restaurant = {
  restaurant_id: 1,
  name: 'Cafe Aroma',
  description: 'Coffee and pastries',
  category_name: 'Cafe',
  location: 'Downtown',
  latitude: '23.78',
  longitude: '90.41',
  phone: '555-0100',
  opening_time: '8:00 AM',
  closing_time: '10:00 PM',
  price_range: '$$',
  image: null,
  video_url: null,
  rating: '4.5',
};

const request = (path, body, userId = null, method = 'POST') =>
  new Promise((resolve, reject) => {
    const serializedBody = body === undefined ? '' : JSON.stringify(body);
    const token = userId === null
      ? null
      : jwt.sign({user_id: userId}, process.env.JWT_SECRET);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: server.address().port,
        path,
        method,
        agent: false,
        headers: {
          ...(token ? {Authorization: ['Bearer', token].join(' ')} : {}),
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
  insertedReview = null;
  paginationValues = null;
  mock.method(db, 'query', (sql, values, callback) => {
    if (/SELECT COUNT\(\*\) AS total_count FROM restaurants/.test(sql)) {
      callback(null, [{total_count: 21}]);
      return;
    }

    if (/INSERT INTO reviews/.test(sql)) {
      insertedReview = values;
      callback(null, {insertId: 42});
      return;
    }

    if (/SELECT restaurant_id FROM restaurants/.test(sql)) {
      callback(null, values[0] === 1 ? [{restaurant_id: 1}] : []);
      return;
    }

    if (/FROM reviews rv/.test(sql) && /JOIN users/.test(sql)) {
      callback(null, [{
        review_id: 8,
        rating: 5,
        review_text: 'Excellent coffee',
        image_url: null,
        created_at: new Date('2026-01-02T03:04:05.000Z'),
        user_name: 'Reviewer',
        password_hash: 'must-not-be-exposed',
      }]);
      return;
    }

    if (/FROM restaurants r/.test(sql) && /JOIN categories c/.test(sql)) {
      if (/LIMIT \? OFFSET \?/.test(sql)) {
        paginationValues = values;
      }
      callback(null, [restaurant]);
      return;
    }

    callback(new Error('Unexpected database query: ' + sql));
  });

  const app = express();
  app.use(express.json());
  app.use('/graphql', graphqlRoutes);
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

test('fetches a restaurant and its reviews without exposing sensitive user data', async () => {
  const response = await request('/graphql', {
    query: `query {
      restaurant(id: "1") {
        restaurantId
        name
        category
        rating
        reviews { reviewId rating comment userName }
      }
    }`,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json().data.restaurant, {
    restaurantId: 1,
    name: 'Cafe Aroma',
    category: 'Cafe',
    rating: 4.5,
    reviews: [{
      reviewId: 8,
      rating: 5,
      comment: 'Excellent coffee',
      userName: 'Reviewer',
    }],
  });
  assert.doesNotMatch(JSON.stringify(response.json()), /password_hash/);
});

test('lists restaurants using bounded limit/offset pagination', async () => {
  const response = await request('/graphql', {
    query: `query Restaurants($limit: Int!, $offset: Int!) {
      restaurants(limit: $limit, offset: $offset) {
        totalCount
        limit
        offset
        restaurants { restaurantId name }
      }
    }`,
    variables: {limit: 5, offset: 10},
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.json().data.restaurants, {
    totalCount: 21,
    limit: 5,
    offset: 10,
    restaurants: [{restaurantId: 1, name: 'Cafe Aroma'}],
  });
  assert.deepEqual(paginationValues, [5, 10]);
});

test('adds a review for the authenticated JWT user, not a supplied user ID', async () => {
  const response = await request(
    '/graphql',
    {
      query: `mutation AddReview(
        $restaurantId: ID!, $rating: Int!, $comment: String
      ) {
        addReview(
          restaurantId: $restaurantId,
          rating: $rating,
          comment: $comment
        ) { reviewId rating comment }
      }`,
      variables: {
        restaurantId: '1',
        rating: 4,
        comment: 'Nice place',
        userId: 999,
      },
    },
    7,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.json().data.addReview, {
    reviewId: 42,
    rating: 4,
    comment: 'Nice place',
  });
  assert.deepEqual(insertedReview, [7, 1, 4, 'Nice place']);
});

test('rejects unauthenticated and invalid review submissions', async () => {
  const mutation = `mutation {
    addReview(restaurantId: "1", rating: 5, comment: "Good") { reviewId }
  }`;

  const unauthenticated = await request('/graphql', {query: mutation});
  assert.match(unauthenticated.json().errors[0].message, /Authentication required/);
  assert.equal(insertedReview, null);

  const invalidRating = await request('/graphql', {
    query: `mutation {
      addReview(restaurantId: "1", rating: 6) { reviewId }
    }`,
  }, 7);
  assert.match(invalidRating.json().errors[0].message, /between 1 and 5/);
  assert.equal(insertedReview, null);

  const missingRestaurant = await request('/graphql', {
    query: `mutation {
      addReview(restaurantId: "999", rating: 5) { reviewId }
    }`,
  }, 7);
  assert.match(missingRestaurant.json().errors[0].message, /Restaurant not found/);
  assert.equal(insertedReview, null);
});

test('rejects invalid restaurant IDs and out-of-range pagination', async () => {
  const invalidRestaurant = await request('/graphql', {
    query: `query {
      restaurant(id: "not-an-id") { restaurantId }
    }`,
  });
  assert.match(
    invalidRestaurant.json().errors[0].message,
    /positive integer/,
  );

  const invalidPagination = await request('/graphql', {
    query: `query {
      restaurants(limit: 101) { totalCount }
    }`,
  });
  assert.match(
    invalidPagination.json().errors[0].message,
    /between 1 and 100/,
  );
  assert.equal(paginationValues, null);
});

test('keeps the existing REST restaurant detail endpoint available', async () => {
  const response = await request('/api/restaurants/1', undefined, null, 'GET');

  assert.equal(response.status, 200);
  assert.equal(response.json().name, 'Cafe Aroma');
});

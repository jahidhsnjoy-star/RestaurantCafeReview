const assert = require('node:assert/strict');
const {afterEach, beforeEach, mock, test} = require('node:test');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'reservations-test-secret';

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
const reservationRoutes = require('../routes/reservationRoutes');

let server;
let reservations;
let nextReservationId;

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
        path: `/api/reservations${path}`,
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

const futureDate = (days = 2) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const validInput = () => ({
  restaurant_id: 1,
  reservation_date: futureDate(),
  reservation_time: '18:30',
  guests: 2,
  special_request: 'Window seat, if available',
});

beforeEach(async () => {
  reservations = [];
  nextReservationId = 1;
  mock.method(db, 'query', (sql, values, callback) => {
    if (/SELECT restaurant_id FROM restaurants/.test(sql)) {
      callback(null, values[0] === 1 ? [{restaurant_id: 1}] : []);
      return;
    }

    if (/INSERT INTO reservations/.test(sql)) {
      const [userId, restaurantId, date, time, guests, specialRequest] = values;
      const reservation = {
        reservation_id: nextReservationId++,
        user_id: userId,
        restaurant_id: restaurantId,
        reservation_date: date,
        reservation_time: time,
        guests,
        special_request: specialRequest,
        status: 'pending',
      };
      reservations.push(reservation);
      callback(null, {insertId: reservation.reservation_id, affectedRows: 1});
      return;
    }

    if (/FROM reservations rv/.test(sql)) {
      const [userId] = values;
      callback(null, reservations
        .filter(reservation => reservation.user_id === userId)
        .map(reservation => ({
          ...reservation,
          restaurant_name: 'Cafe One',
          restaurant_location: 'Downtown',
          restaurant_phone: null,
          restaurant_image: null,
        })));
      return;
    }

    if (/UPDATE reservations/.test(sql)) {
      const [reservationId, userId] = values;
      const reservation = reservations.find(item =>
        item.reservation_id === reservationId && item.user_id === userId &&
        item.status !== 'cancelled',
      );
      if (reservation) {
        reservation.status = 'cancelled';
        callback(null, {affectedRows: 1});
      } else {
        callback(null, {affectedRows: 0});
      }
      return;
    }

    if (/SELECT status FROM reservations/.test(sql)) {
      const [reservationId, userId] = values;
      const reservation = reservations.find(item =>
        item.reservation_id === reservationId && item.user_id === userId,
      );
      callback(null, reservation ? [{status: reservation.status}] : []);
      return;
    }

    callback(new Error('Unexpected database query'));
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reservations', reservationRoutes);
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

test('creates a pending reservation using the authenticated user ID', async () => {
  const response = await request('/', 'POST', {...validInput(), user_id: 999});

  assert.equal(response.status, 201);
  assert.equal(response.json().reservation.status, 'pending');
  assert.equal(reservations[0].user_id, 7);
  assert.equal(reservations[0].user_id === 999, false);
});

test('rejects missing and invalid reservation fields', async () => {
  const missing = await request('/', 'POST', {});
  assert.equal(missing.status, 400);

  const invalidDate = await request('/', 'POST', {
    ...validInput(),
    reservation_date: '2026-02-30',
  });
  assert.equal(invalidDate.status, 400);

  const invalidGuests = await request('/', 'POST', {
    ...validInput(),
    guests: 11,
  });
  assert.equal(invalidGuests.status, 400);

  const invalidTime = await request('/', 'POST', {
    ...validInput(),
    reservation_time: '25:30',
  });
  assert.equal(invalidTime.status, 400);
  assert.equal(reservations.length, 0);
});

test('rejects reservations for restaurants that do not exist', async () => {
  const response = await request('/', 'POST', {
    ...validInput(),
    restaurant_id: 999,
  });

  assert.equal(response.status, 404);
  assert.equal(reservations.length, 0);
});

test('rejects past reservation dates and times today', async () => {
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 1);
  const yesterday = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;

  const oldDate = await request('/', 'POST', {
    ...validInput(),
    reservation_date: yesterday,
  });
  assert.equal(oldDate.status, 400);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const oldTime = await request('/', 'POST', {
    ...validInput(),
    reservation_date: today,
    reservation_time: '00:00:00',
  });
  assert.equal(oldTime.status, 400);
  assert.equal(reservations.length, 0);
});

test('requires authentication for create, list, and cancellation', async () => {
  assert.equal((await request('/', 'POST', validInput(), null)).status, 401);
  assert.equal((await request('/my', 'GET', undefined, null)).status, 401);
  assert.equal((await request('/1/cancel', 'PUT', undefined, null)).status, 401);
});

test('lists only reservations belonging to the authenticated user', async () => {
  reservations.push(
    {reservation_id: 1, user_id: 7, restaurant_id: 1, status: 'pending'},
    {reservation_id: 2, user_id: 8, restaurant_id: 1, status: 'confirmed'},
  );

  const response = await request('/my', 'GET');
  assert.equal(response.status, 200);
  assert.deepEqual(response.json().map(reservation => reservation.reservation_id), [1]);
  assert.equal(response.json()[0].restaurant_name, 'Cafe One');
});

test('allows an owner to cancel a reservation only once', async () => {
  reservations.push({
    reservation_id: 1,
    user_id: 7,
    restaurant_id: 1,
    status: 'pending',
  });

  assert.equal((await request('/1/cancel', 'PUT')).status, 200);
  assert.equal(reservations[0].status, 'cancelled');
  assert.equal((await request('/1/cancel', 'PUT')).status, 409);
});

test('does not let another user cancel a reservation', async () => {
  reservations.push({
    reservation_id: 1,
    user_id: 8,
    restaurant_id: 1,
    status: 'pending',
  });

  assert.equal((await request('/1/cancel', 'PUT', undefined, 7)).status, 404);
  assert.equal(reservations[0].status, 'pending');
});

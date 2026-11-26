const express = require('express');
const router = express.Router();

const db = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');

const query = (sql, values) => new Promise((resolve, reject) => {
  db.query(sql, values, (error, results) => {
    if (error) {
      reject(error);
      return;
    }

    resolve(results);
  });
});

const parsePositiveInteger = value =>
  Number.isSafeInteger(value) && value > 0 ? value : null;

const parseReservationDate = value => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return year >= 1000 &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? value
    : null;
};

const parseReservationTime = value => {
  if (typeof value !== 'string') {
    return null;
  }

  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match ? `${match[1]}:${match[2]}:${match[3] || '00'}` : null;
};

const getLocalDateTime = () => {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
  };
};

const isPastReservation = (date, time) => {
  const now = getLocalDateTime();
  return date < now.date || (date === now.date && time <= now.time);
};

const logDatabaseError = (action, error) => {
  console.error(`Error ${action}:`, error?.code || 'database error');
};

router.post('/', authenticateToken, async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const restaurantId = parsePositiveInteger(body.restaurant_id);
  const reservationDate = parseReservationDate(body.reservation_date);
  const reservationTime = parseReservationTime(body.reservation_time);
  const guests = parsePositiveInteger(body.guests);
  const specialRequest = body.special_request === undefined || body.special_request === null
    ? null
    : typeof body.special_request === 'string'
      ? body.special_request.trim()
      : undefined;

  if (restaurantId === null) {
    return res.status(400).json({message: 'A valid restaurant_id is required'});
  }
  if (reservationDate === null) {
    return res.status(400).json({message: 'reservation_date must be a valid YYYY-MM-DD date'});
  }
  if (reservationTime === null) {
    return res.status(400).json({message: 'reservation_time must be a valid 24-hour time'});
  }
  if (guests === null || guests > 10) {
    return res.status(400).json({message: 'guests must be an integer between 1 and 10'});
  }
  if (specialRequest === undefined || (specialRequest !== null && specialRequest.length > 2000)) {
    return res.status(400).json({message: 'special_request must be 2000 characters or fewer'});
  }
  if (isPastReservation(reservationDate, reservationTime)) {
    return res.status(400).json({message: 'Reservation date and time must be in the future'});
  }

  try {
    const restaurants = await query(
      'SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? LIMIT 1',
      [restaurantId],
    );
    if (restaurants.length === 0) {
      return res.status(404).json({message: 'Restaurant not found'});
    }

    const result = await query(
      `INSERT INTO reservations
         (user_id, restaurant_id, reservation_date, reservation_time, guests, special_request)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.user_id,
        restaurantId,
        reservationDate,
        reservationTime,
        guests,
        specialRequest || null,
      ],
    );

    return res.status(201).json({
      message: 'Reservation request created',
      reservation: {
        reservation_id: result.insertId,
        restaurant_id: restaurantId,
        reservation_date: reservationDate,
        reservation_time: reservationTime,
        guests,
        special_request: specialRequest || null,
        status: 'pending',
      },
    });
  } catch (error) {
    logDatabaseError('creating reservation', error);
    return res.status(500).json({message: 'Failed to create reservation'});
  }
});

router.get('/my', authenticateToken, async (req, res) => {
  try {
    const reservations = await query(
      `SELECT
         rv.reservation_id,
         rv.restaurant_id,
         DATE_FORMAT(rv.reservation_date, '%Y-%m-%d') AS reservation_date,
         TIME_FORMAT(rv.reservation_time, '%H:%i:%s') AS reservation_time,
         rv.guests,
         rv.special_request,
         rv.status,
         rv.created_at,
         r.name AS restaurant_name,
         r.location AS restaurant_location,
         r.phone AS restaurant_phone,
         r.image AS restaurant_image
       FROM reservations rv
       JOIN restaurants r ON r.restaurant_id = rv.restaurant_id
       WHERE rv.user_id = ?
       ORDER BY
         (rv.reservation_date < CURRENT_DATE() OR
           (rv.reservation_date = CURRENT_DATE() AND rv.reservation_time < CURRENT_TIME())) ASC,
         rv.reservation_date ASC,
         rv.reservation_time ASC,
         rv.created_at DESC`,
      [req.user.user_id],
    );

    return res.json(reservations);
  } catch (error) {
    logDatabaseError('fetching reservations', error);
    return res.status(500).json({message: 'Failed to fetch reservations'});
  }
});

router.put('/:id/cancel', authenticateToken, async (req, res) => {
  const reservationId = /^\d+$/.test(req.params.id)
    ? parsePositiveInteger(Number(req.params.id))
    : null;

  if (reservationId === null) {
    return res.status(400).json({message: 'Invalid reservation ID'});
  }

  try {
    const result = await query(
      `UPDATE reservations
       SET status = 'cancelled'
       WHERE reservation_id = ? AND user_id = ? AND status <> 'cancelled'`,
      [reservationId, req.user.user_id],
    );

    if (result.affectedRows === 0) {
      const reservations = await query(
        'SELECT status FROM reservations WHERE reservation_id = ? AND user_id = ? LIMIT 1',
        [reservationId, req.user.user_id],
      );
      if (reservations.length === 0) {
        return res.status(404).json({message: 'Reservation not found'});
      }

      return res.status(409).json({message: 'Reservation is already cancelled'});
    }

    return res.json({
      message: 'Reservation cancelled',
      reservation_id: reservationId,
      status: 'cancelled',
    });
  } catch (error) {
    logDatabaseError('cancelling reservation', error);
    return res.status(500).json({message: 'Failed to cancel reservation'});
  }
});

module.exports = router;

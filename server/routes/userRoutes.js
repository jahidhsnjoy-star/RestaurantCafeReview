const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const db = require('../config/db');

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

router.post('/register', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  if (!name || name.length > 100) {
    return res.status(400).json({message: 'Name is required and must be 100 characters or fewer'});
  }

  if (!isValidEmail(email) || email.length > 254) {
    return res.status(400).json({message: 'Please provide a valid email address'});
  }

  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({message: 'Password must be at least 8 characters and no more than 72 bytes'});
  }

  try {
    const [existingUsers] = await db.promise().execute(
      'SELECT user_id FROM users WHERE email = ? LIMIT 1',
      [email],
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({message: 'An account with this email already exists'});
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const [result] = await db.promise().execute(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'user')",
      [name, email, hashedPassword],
    );

    return res.status(201).json({
      message: 'Registration successful',
      user: {
        user_id: result.insertId,
        name,
        email,
        role: 'user',
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({message: 'An account with this email already exists'});
    }

    console.error('Error registering user:', error);
    return res.status(500).json({message: 'Registration failed. Please try again later'});
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
      'SELECT user_id, name, email, password, role FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    const user = users[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({message: 'Email or password is incorrect'});
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
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    return res.status(500).json({message: 'Login failed. Please try again later'});
  }
});

router.get('/:id', (req, res) => {
  const userId = Number(req.params.id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: 'A valid user_id is required',
    });
  }

  const sql = `
    SELECT user_id, name, email, 'user' AS role
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
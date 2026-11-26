const express = require('express');
const cors = require('cors');
const db = require('./config/db');

const restaurantRoutes = require('./routes/restaurantRoutes');
const userRoutes = require('./routes/userRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const graphqlRoutes = require('./routes/graphqlRoutes');
const authenticateToken = require('./middleware/authMiddleware');

const app = express();

app.use(cors());
app.use(express.json());

// Home route
app.get('/', (req, res) => {
  res.json({
    message: 'Restaurant & Cafe Review API is running!',
  });
});

// Favorite restaurants for a user
app.get('/api/favorites', authenticateToken, (req, res) => {
  const userId = req.user.user_id;
  const sql = `
    SELECT
      r.restaurant_id,
      r.name,
      r.description,
      c.category_name,
      r.location,
      r.phone,
      r.opening_time,
      r.closing_time,
      r.price_range,
      r.image
    FROM favorites f
    JOIN restaurants r
      ON f.restaurant_id = r.restaurant_id
    JOIN categories c
      ON r.category_id = c.category_id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching favorites:', err);

      return res.status(500).json({
        message: 'Failed to fetch favorites',
      });
    }

    res.json(results);
  });
});

// Restaurant routes
app.use('/api/restaurants', restaurantRoutes);
app.use('/api/users', userRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/graphql', graphqlRoutes);

const PORT = 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
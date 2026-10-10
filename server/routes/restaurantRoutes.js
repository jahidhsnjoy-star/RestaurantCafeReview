const express = require('express');
const router = express.Router();

const db = require('../config/db');


// ===============================
// Favorite Restaurant
// ===============================
router.post('/:id/favorite', (req, res) => {
  const restaurantId = req.params.id;
  const userId = Number(req.body.user_id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: 'A valid user_id is required',
    });
  }

  const sql = `
    INSERT IGNORE INTO favorites (user_id, restaurant_id)
    VALUES (?, ?)
  `;

  db.query(sql, [userId, restaurantId], (err, result) => {
    if (err) {
      console.error('Error adding favorite:', err);

      return res.status(500).json({
        message: 'Failed to add favorite',
      });
    }

    res.status(result.affectedRows === 0 ? 200 : 201).json({
      message: result.affectedRows === 0
        ? 'Restaurant is already a favorite'
        : 'Restaurant added to favorites',
      isFavorite: true,
      alreadyFavorite: result.affectedRows === 0,
    });
  });
});

// ===============================
// Remove Favorite Restaurant
// ===============================
router.delete('/:id/favorite', (req, res) => {
  const restaurantId = req.params.id;
  const userId = Number(req.query.user_id || req.body.user_id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: 'A valid user_id is required',
    });
  }

  const sql = `
    DELETE FROM favorites
    WHERE user_id = ? AND restaurant_id = ?
  `;

  db.query(sql, [userId, restaurantId], (err, result) => {
    if (err) {
      console.error('Error removing favorite:', err);

      return res.status(500).json({
        message: 'Failed to remove favorite',
      });
    }

    res.json({
      message: result.affectedRows === 0
        ? 'Restaurant was not in favorites'
        : 'Restaurant removed from favorites',
      isFavorite: false,
    });
  });
});

// ===============================
// Check Favorite Status
// ===============================
router.get('/:id/favorite', (req, res) => {
  const restaurantId = req.params.id;
  const userId = Number(req.query.user_id);

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({
      message: 'A valid user_id is required',
    });
  }

  const sql = `
    SELECT favorite_id
    FROM favorites
    WHERE user_id = ? AND restaurant_id = ?
    LIMIT 1
  `;

  db.query(sql, [userId, restaurantId], (err, results) => {
    if (err) {
      console.error('Error checking favorite:', err);

      return res.status(500).json({
        message: 'Failed to check favorite status',
      });
    }

    res.json({isFavorite: results.length > 0});
  });
});


// ===============================
// Get All Restaurants
// ===============================
router.get('/', (req, res) => {
  const hasListOptions =
    req.query.page !== undefined ||
    req.query.limit !== undefined ||
    req.query.search !== undefined ||
    req.query.category !== undefined;

  const selectSql = `
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
    FROM restaurants r
    JOIN categories c
      ON r.category_id = c.category_id
  `;

  if (!hasListOptions) {
    db.query(`${selectSql} ORDER BY r.restaurant_id`, (err, results) => {
      if (err) {
        console.error('Error fetching restaurants:', err);

        return res.status(500).json({
          message: 'Failed to fetch restaurants',
        });
      }

      res.json(results);
    });

    return;
  }

  const pageValue = req.query.page === undefined ? '1' : req.query.page;
  const limitValue = req.query.limit === undefined ? '5' : req.query.limit;
  const page = Number(pageValue);
  const limit = Number(limitValue);

  if (
    typeof pageValue !== 'string' ||
    !/^\d+$/.test(pageValue) ||
    !Number.isSafeInteger(page) ||
    page < 1
  ) {
    return res.status(400).json({
      message: 'page must be a positive integer',
    });
  }

  if (
    typeof limitValue !== 'string' ||
    !/^\d+$/.test(limitValue) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return res.status(400).json({
      message: 'limit must be an integer between 1 and 100',
    });
  }

  const search = req.query.search === undefined ? '' : req.query.search;
  const category = req.query.category === undefined ? '' : req.query.category;

  if (typeof search !== 'string' || typeof category !== 'string') {
    return res.status(400).json({
      message: 'search and category must be strings',
    });
  }

  const filters = [];
  const filterValues = [];

  if (search.trim()) {
    filters.push(`(
      LOWER(r.name) LIKE LOWER(?) ESCAPE '!'
      OR LOWER(r.location) LIKE LOWER(?) ESCAPE '!'
      OR LOWER(c.category_name) LIKE LOWER(?) ESCAPE '!'
    )`);
    const escapedSearch = search.trim().replace(/[!%_]/g, character => `!${character}`);
    const searchPattern = `%${escapedSearch}%`;
    filterValues.push(searchPattern, searchPattern, searchPattern);
  }

  if (category.trim() && category.toLowerCase() !== 'all') {
    filters.push('LOWER(c.category_name) = LOWER(?)');
    filterValues.push(category.trim());
  }

  const whereSql = filters.length > 0
    ? `WHERE ${filters.join(' AND ')}`
    : '';
  const countSql = `
    SELECT COUNT(*) AS totalRestaurants
    FROM restaurants r
    JOIN categories c
      ON r.category_id = c.category_id
    ${whereSql}
  `;

  db.query(countSql, filterValues, (countError, countResults) => {
    if (countError) {
      console.error('Error counting restaurants:', countError);

      return res.status(500).json({
        message: 'Failed to fetch restaurants',
      });
    }

    const totalRestaurants = Number(countResults[0].totalRestaurants);
    const totalPages = Math.ceil(totalRestaurants / limit);
    const currentPage = Math.min(page, Math.max(totalPages, 1));
    const offset = (currentPage - 1) * limit;

    db.query(
      `SELECT DISTINCT c.category_name
       FROM restaurants r
       JOIN categories c ON r.category_id = c.category_id
       ORDER BY c.category_name`,
      (categoryError, categoryResults) => {
        if (categoryError) {
          console.error('Error fetching restaurant categories:', categoryError);

          return res.status(500).json({
            message: 'Failed to fetch restaurants',
          });
        }

        db.query(
          `${selectSql} ${whereSql} ORDER BY r.restaurant_id LIMIT ? OFFSET ?`,
          [...filterValues, limit, offset],
          (err, results) => {
            if (err) {
              console.error('Error fetching restaurants:', err);

              return res.status(500).json({
                message: 'Failed to fetch restaurants',
              });
            }

            res.json({
              restaurants: results,
              currentPage,
              totalPages,
              totalRestaurants,
              categories: categoryResults.map(row => row.category_name),
            });
          },
        );
      },
    );
  });
});


// ===============================
// Get Restaurant Reviews
// ===============================
router.get('/:id/reviews', (req, res) => {
  const restaurantId = req.params.id;

  const sql = `
    SELECT
      rv.review_id,
      rv.user_id,
      rv.rating,
      rv.review_text,
      rv.created_at,
      u.name AS user_name
    FROM reviews rv
    JOIN users u
      ON rv.user_id = u.user_id
    WHERE rv.restaurant_id = ?
    ORDER BY rv.created_at DESC
  `;

  db.query(sql, [restaurantId], (err, results) => {
    if (err) {
      console.error('Error fetching reviews:', err);

      return res.status(500).json({
        message: 'Failed to fetch reviews',
      });
    }

    res.json(results);
  });
});


// ===============================
// Get Single Restaurant
// ===============================
router.get('/:id', (req, res) => {
  const restaurantId = req.params.id;

  const sql = `
    SELECT
      r.restaurant_id,
      r.name,
      r.description,
      c.category_name,
      r.location,
      r.latitude,
      r.longitude,
      r.phone,
      r.opening_time,
      r.closing_time,
      r.price_range,
      r.image,
      r.video_url
    FROM restaurants r
    JOIN categories c
      ON r.category_id = c.category_id
    WHERE r.restaurant_id = ?
  `;

  db.query(sql, [restaurantId], (err, results) => {
    if (err) {
      console.error('Error fetching restaurant:', err);

      return res.status(500).json({
        message: 'Failed to fetch restaurant',
      });
    }

    if (results.length === 0) {
      return res.status(404).json({
        message: 'Restaurant not found',
      });
    }

    res.json(results[0]);
  });
});


// ===============================
// Add Review
// ===============================
router.post('/:id/reviews', (req, res) => {
  const restaurantId = req.params.id;

  const {
    user_id,
    rating,
    review_text,
  } = req.body;

  if (!user_id || !rating) {
    return res.status(400).json({
      message: 'User ID and rating are required',
    });
  }

  const sql = `
    INSERT INTO reviews
    (user_id, restaurant_id, rating, review_text)
    VALUES (?, ?, ?, ?)
  `;

  db.query(
    sql,
    [
      user_id,
      restaurantId,
      rating,
      review_text || null,
    ],
    (err, result) => {
      if (err) {
        console.error('Error adding review:', err);

        return res.status(500).json({
          message: 'Failed to add review',
        });
      }

      res.status(201).json({
        message: 'Review added successfully',
        review_id: result.insertId,
      });
    },
  );
});


// ===============================
// Update Review
// ===============================
router.put('/:id/reviews/:reviewId', (req, res) => {
  const restaurantId = req.params.id;
  const reviewId = req.params.reviewId;

  const {
    rating,
    review_text,
  } = req.body;

  if (!rating) {
    return res.status(400).json({
      message: 'Rating is required',
    });
  }

  const sql = `
    UPDATE reviews
    SET
      rating = ?,
      review_text = ?
    WHERE review_id = ?
    AND restaurant_id = ?
  `;

  db.query(
    sql,
    [
      rating,
      review_text || null,
      reviewId,
      restaurantId,
    ],
    (err, result) => {
      if (err) {
        console.error('Error updating review:', err);

        return res.status(500).json({
          message: 'Failed to update review',
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: 'Review not found',
        });
      }

      res.json({
        message: 'Review updated successfully',
      });
    },
  );
});

// ===============================
// Delete Review
// ===============================
router.delete('/:id/reviews/:reviewId', (req, res) => {
  const restaurantId = req.params.id;
  const reviewId = req.params.reviewId;

  const sql = `
    DELETE FROM reviews
    WHERE review_id = ?
    AND restaurant_id = ?
  `;

  db.query(
    sql,
    [reviewId, restaurantId],
    (err, result) => {
      if (err) {
        console.error('Error deleting review:', err);

        return res.status(500).json({
          message: 'Failed to delete review',
        });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: 'Review not found',
        });
      }

      res.json({
        message: 'Review deleted successfully',
      });
    },
  );
});

module.exports = router;
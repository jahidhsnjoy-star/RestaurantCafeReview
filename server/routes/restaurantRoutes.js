const express = require('express');
const router = express.Router();

const db = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');
const optionalAuthenticateToken = authenticateToken.optional;
const {reviewImageUpload} = require('../middleware/reviewImageUpload');
const reviewImageStorage = require('../config/cloudinary');

const query = (sql, values) => new Promise((resolve, reject) => {
  db.query(sql, values, (error, results) => {
    if (error) {
      reject(error);
      return;
    }

    resolve(results);
  });
});

const parseRating = value => {
  const rating = Number(value);
  return Number.isInteger(rating) && rating >= 1 && rating <= 5
    ? rating
    : null;
};

const getReviewText = value => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return typeof value === 'string' ? value : undefined;
};

const cleanupReviewImage = async publicId => {
  if (!publicId) {
    return true;
  }

  try {
    const removed = await reviewImageStorage.deleteReviewImage(publicId);
    if (!removed) {
      console.error('Cloudinary review image cleanup failed');
    }
    return removed;
  } catch {
    console.error('Cloudinary review image cleanup failed');
    return false;
  }
};

const parseRestaurantId = value =>
  /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;

const getReactionSummary = async (restaurantId, userId) => {
  const results = await query(
    `SELECT
       COUNT(CASE WHEN reaction_type = 'like' THEN 1 END) AS like_count,
       COUNT(CASE WHEN reaction_type = 'dislike' THEN 1 END) AS dislike_count,
       MAX(CASE WHEN user_id = ? THEN reaction_type END) AS user_reaction
     FROM restaurant_reactions
     WHERE restaurant_id = ?`,
    [userId, restaurantId],
  );
  const summary = results[0];
  return {
    like_count: Number(summary.like_count),
    dislike_count: Number(summary.dislike_count),
    user_reaction: summary.user_reaction,
  };
};

const sendReactionSummary = async (res, restaurantId, userId) => {
  try {
    return res.json(await getReactionSummary(restaurantId, userId));
  } catch (error) {
    console.error('Error fetching restaurant reactions:', error?.code || 'database error');
    return res.status(500).json({message: 'Failed to fetch restaurant reactions'});
  }
};


// ===============================
// Favorite Restaurant
// ===============================
router.post('/:id/favorite', authenticateToken, (req, res) => {
  const restaurantId = req.params.id;
  const userId = req.user.user_id;

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
router.delete('/:id/favorite', authenticateToken, (req, res) => {
  const restaurantId = req.params.id;
  const userId = req.user.user_id;

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
router.get('/:id/favorite', authenticateToken, (req, res) => {
  const restaurantId = req.params.id;
  const userId = req.user.user_id;

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
// Add or change a restaurant reaction
// ===============================
router.put('/:id/reaction', authenticateToken, async (req, res) => {
  const restaurantId = parseRestaurantId(req.params.id);
  const reaction = req.body?.reaction;

  if (restaurantId === null) {
    return res.status(400).json({message: 'Invalid restaurant ID'});
  }

  if (reaction !== 'like' && reaction !== 'dislike') {
    return res.status(400).json({message: 'Reaction must be like or dislike'});
  }

  try {
    const restaurants = await query(
      'SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? LIMIT 1',
      [restaurantId],
    );
    if (restaurants.length === 0) {
      return res.status(404).json({message: 'Restaurant not found'});
    }

    await query(
      `INSERT INTO restaurant_reactions (user_id, restaurant_id, reaction_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE reaction_type = VALUES(reaction_type)`,
      [req.user.user_id, restaurantId, reaction],
    );
  } catch (error) {
    console.error('Error updating restaurant reaction:', error?.code || 'database error');
    return res.status(500).json({message: 'Failed to update restaurant reaction'});
  }

  return sendReactionSummary(res, restaurantId, req.user.user_id);
});

// ===============================
// Remove a restaurant reaction
// ===============================
router.delete('/:id/reaction', authenticateToken, async (req, res) => {
  const restaurantId = parseRestaurantId(req.params.id);

  if (restaurantId === null) {
    return res.status(400).json({message: 'Invalid restaurant ID'});
  }

  try {
    const restaurants = await query(
      'SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? LIMIT 1',
      [restaurantId],
    );
    if (restaurants.length === 0) {
      return res.status(404).json({message: 'Restaurant not found'});
    }

    await query(
      `DELETE FROM restaurant_reactions
       WHERE user_id = ? AND restaurant_id = ?`,
      [req.user.user_id, restaurantId],
    );
  } catch (error) {
    console.error('Error removing restaurant reaction:', error?.code || 'database error');
    return res.status(500).json({message: 'Failed to remove restaurant reaction'});
  }

  return sendReactionSummary(res, restaurantId, req.user.user_id);
});


// ===============================
// Get All Restaurants
// ===============================
router.get('/', optionalAuthenticateToken, (req, res) => {
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
      r.image,
      r.video_url,
      COALESCE(reaction_counts.like_count, 0) AS like_count,
      COALESCE(reaction_counts.dislike_count, 0) AS dislike_count,
      current_reaction.reaction_type AS user_reaction
    FROM restaurants r
    JOIN categories c
      ON r.category_id = c.category_id
    LEFT JOIN (
      SELECT
        restaurant_id,
        COUNT(CASE WHEN reaction_type = 'like' THEN 1 END) AS like_count,
        COUNT(CASE WHEN reaction_type = 'dislike' THEN 1 END) AS dislike_count
      FROM restaurant_reactions
      GROUP BY restaurant_id
    ) reaction_counts
      ON reaction_counts.restaurant_id = r.restaurant_id
    LEFT JOIN restaurant_reactions current_reaction
      ON current_reaction.restaurant_id = r.restaurant_id
      AND current_reaction.user_id = ?
  `;

  if (!hasListOptions) {
    db.query(`${selectSql} ORDER BY r.restaurant_id`, [req.user?.user_id ?? null], (err, results) => {
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
          [req.user?.user_id ?? null, ...filterValues, limit, offset],
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
      rv.image_url,
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
router.post('/:id/reviews', authenticateToken, reviewImageUpload, async (req, res) => {
  const restaurantId = req.params.id;
  const rating = parseRating(req.body.rating);
  const reviewText = getReviewText(req.body.review_text);

  if (rating === null) {
    return res.status(400).json({
      message: 'Rating must be an integer between 1 and 5',
    });
  }

  if (reviewText === undefined) {
    return res.status(400).json({message: 'Review text must be a string'});
  }

  let uploadedImage = null;
  if (req.file) {
    try {
      uploadedImage = await reviewImageStorage.uploadReviewImage(req.file.buffer);
    } catch {
      console.error('Cloudinary review image upload failed');
      return res.status(502).json({message: 'Unable to upload review image'});
    }
  }

  try {
    const result = await query(
      `INSERT INTO reviews
       (user_id, restaurant_id, rating, review_text, image_url, cloudinary_public_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.user_id,
        restaurantId,
        rating,
        reviewText,
        uploadedImage?.imageUrl ?? null,
        uploadedImage?.publicId ?? null,
      ],
    );

    return res.status(201).json({
      message: 'Review added successfully',
      review_id: result.insertId,
      image_url: uploadedImage?.imageUrl ?? null,
      cloudinary_public_id: uploadedImage?.publicId ?? null,
    });
  } catch (error) {
    if (uploadedImage) {
      await cleanupReviewImage(uploadedImage.publicId);
    }
    console.error('Error adding review:', error?.code || 'database error');
    return res.status(500).json({message: 'Failed to add review'});
  }
});


// ===============================
// Update Review
// ===============================
router.put(
  '/:id/reviews/:reviewId',
  authenticateToken,
  reviewImageUpload,
  async (req, res) => {
    const restaurantId = req.params.id;
    const reviewId = req.params.reviewId;
    const rating = parseRating(req.body.rating);
    const reviewText = getReviewText(req.body.review_text);
    const removeImageValue = req.body.remove_image;
    const shouldRemoveImage =
      removeImageValue === true || removeImageValue === 'true';

    if (rating === null) {
      return res.status(400).json({
        message: 'Rating must be an integer between 1 and 5',
      });
    }

    if (reviewText === undefined) {
      return res.status(400).json({message: 'Review text must be a string'});
    }

    if (
      removeImageValue !== undefined &&
      removeImageValue !== true &&
      removeImageValue !== false &&
      removeImageValue !== 'true' &&
      removeImageValue !== 'false'
    ) {
      return res.status(400).json({message: 'remove_image must be a boolean'});
    }

    if (req.file && shouldRemoveImage) {
      return res.status(400).json({
        message: 'Choose an image to replace the current image or remove it, not both',
      });
    }

    let existingReview;
    try {
      const results = await query(
        `SELECT review_id, image_url, cloudinary_public_id
         FROM reviews
         WHERE review_id = ? AND restaurant_id = ? AND user_id = ?
         LIMIT 1`,
        [reviewId, restaurantId, req.user.user_id],
      );
      existingReview = results[0];
    } catch (error) {
      console.error('Error checking review ownership:', error?.code || 'database error');
      return res.status(500).json({message: 'Failed to update review'});
    }

    if (!existingReview) {
      return res.status(404).json({message: 'Review not found'});
    }

    let uploadedImage = null;
    if (req.file) {
      try {
        uploadedImage = await reviewImageStorage.uploadReviewImage(req.file.buffer);
      } catch {
        console.error('Cloudinary review image upload failed');
        return res.status(502).json({message: 'Unable to upload review image'});
      }
    }

    const imageUrl = uploadedImage
      ? uploadedImage.imageUrl
      : shouldRemoveImage
        ? null
        : existingReview.image_url;
    const publicId = uploadedImage
      ? uploadedImage.publicId
      : shouldRemoveImage
        ? null
        : existingReview.cloudinary_public_id;

    try {
      await query(
        `UPDATE reviews
         SET rating = ?, review_text = ?, image_url = ?, cloudinary_public_id = ?
         WHERE review_id = ? AND restaurant_id = ? AND user_id = ?`,
        [
          rating,
          reviewText,
          imageUrl,
          publicId,
          reviewId,
          restaurantId,
          req.user.user_id,
        ],
      );
    } catch (error) {
      if (uploadedImage) {
        await cleanupReviewImage(uploadedImage.publicId);
      }
      console.error('Error updating review:', error?.code || 'database error');
      return res.status(500).json({message: 'Failed to update review'});
    }

    const imageChanged = Boolean(uploadedImage || shouldRemoveImage);
    const cleanupPending =
      imageChanged && existingReview.cloudinary_public_id
        ? !(await cleanupReviewImage(existingReview.cloudinary_public_id))
        : false;

    return res.json({
      message: 'Review updated successfully',
      image_url: imageUrl,
      cleanup_pending: cleanupPending,
    });
  },
);

// ===============================
// Delete Review
// ===============================
router.delete('/:id/reviews/:reviewId', authenticateToken, async (req, res) => {
  const restaurantId = req.params.id;
  const reviewId = req.params.reviewId;

  try {
    const results = await query(
      `SELECT review_id, cloudinary_public_id
       FROM reviews
       WHERE review_id = ? AND restaurant_id = ? AND user_id = ?
       LIMIT 1`,
      [reviewId, restaurantId, req.user.user_id],
    );

    if (!results[0]) {
      return res.status(404).json({message: 'Review not found'});
    }

    const result = await query(
      `DELETE FROM reviews
       WHERE review_id = ? AND restaurant_id = ? AND user_id = ?`,
      [reviewId, restaurantId, req.user.user_id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({message: 'Review not found'});
    }

    const cleanupPending = results[0].cloudinary_public_id
      ? !(await cleanupReviewImage(results[0].cloudinary_public_id))
      : false;

    return res.json({
      message: 'Review deleted successfully',
      cleanup_pending: cleanupPending,
    });
  } catch (error) {
    console.error('Error deleting review:', error?.code || 'database error');
    return res.status(500).json({message: 'Failed to delete review'});
  }
});

module.exports = router;
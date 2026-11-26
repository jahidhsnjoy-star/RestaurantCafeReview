const {
  GraphQLError,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} = require('graphql');

const db = require('../config/db');

const MAX_PAGE_SIZE = 100;
const MAX_MYSQL_INT = 2147483647;

const query = (sql, values = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, values, (error, results) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(results);
    });
  });

const runQuery = async (sql, values, failureMessage) => {
  try {
    return await query(sql, values);
  } catch (error) {
    console.error(`GraphQL database error (${error?.code || 'unknown'})`);
    throw new GraphQLError(failureMessage);
  }
};

const parseRestaurantId = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_MYSQL_INT
    ? id
    : null;
};

const restaurantSelect = `
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
    r.video_url,
    (
      SELECT AVG(rv.rating)
      FROM reviews rv
      WHERE rv.restaurant_id = r.restaurant_id
    ) AS rating
  FROM restaurants r
  JOIN categories c ON r.category_id = c.category_id
`;

const ReviewType = new GraphQLObjectType({
  name: 'Review',
  fields: {
    reviewId: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: review => Number(review.review_id),
    },
    rating: {type: new GraphQLNonNull(GraphQLInt)},
    comment: {
      type: GraphQLString,
      resolve: review => review.review_text ?? null,
    },
    imageUrl: {
      type: GraphQLString,
      resolve: review => review.image_url ?? null,
    },
    createdAt: {
      type: GraphQLString,
      resolve: review => {
        if (!review.created_at) {
          return null;
        }
        return review.created_at instanceof Date
          ? review.created_at.toISOString()
          : String(review.created_at);
      },
    },
    userName: {
      type: GraphQLString,
      resolve: review => review.user_name ?? null,
    },
  },
});

const RestaurantType = new GraphQLObjectType({
  name: 'Restaurant',
  fields: {
    restaurantId: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: restaurant => Number(restaurant.restaurant_id),
    },
    name: {type: new GraphQLNonNull(GraphQLString)},
    description: {type: GraphQLString},
    category: {
      type: GraphQLString,
      resolve: restaurant => restaurant.category_name ?? null,
    },
    location: {type: GraphQLString},
    latitude: {
      type: GraphQLFloat,
      resolve: restaurant =>
        restaurant.latitude == null ? null : Number(restaurant.latitude),
    },
    longitude: {
      type: GraphQLFloat,
      resolve: restaurant =>
        restaurant.longitude == null ? null : Number(restaurant.longitude),
    },
    phone: {type: GraphQLString},
    openingTime: {
      type: GraphQLString,
      resolve: restaurant => restaurant.opening_time ?? null,
    },
    closingTime: {
      type: GraphQLString,
      resolve: restaurant => restaurant.closing_time ?? null,
    },
    priceRange: {
      type: GraphQLString,
      resolve: restaurant => restaurant.price_range ?? null,
    },
    image: {type: GraphQLString},
    videoUrl: {
      type: GraphQLString,
      resolve: restaurant => restaurant.video_url ?? null,
    },
    rating: {
      type: GraphQLFloat,
      resolve: restaurant =>
        restaurant.rating == null ? null : Number(restaurant.rating),
    },
    reviews: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(ReviewType))),
      resolve: restaurant =>
        runQuery(
          `SELECT
             rv.review_id,
             rv.rating,
             rv.review_text,
             rv.image_url,
             rv.created_at,
             u.name AS user_name
           FROM reviews rv
           JOIN users u ON rv.user_id = u.user_id
           WHERE rv.restaurant_id = ?
           ORDER BY rv.created_at DESC`,
          [restaurant.restaurant_id],
          'Failed to fetch restaurant reviews',
        ),
    },
  },
});

const RestaurantPageType = new GraphQLObjectType({
  name: 'RestaurantPage',
  fields: {
    restaurants: {
      type: new GraphQLNonNull(
        new GraphQLList(new GraphQLNonNull(RestaurantType)),
      ),
    },
    totalCount: {type: new GraphQLNonNull(GraphQLInt)},
    limit: {type: new GraphQLNonNull(GraphQLInt)},
    offset: {type: new GraphQLNonNull(GraphQLInt)},
  },
});

const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    restaurant: {
      type: RestaurantType,
      args: {id: {type: new GraphQLNonNull(GraphQLID)}},
      resolve: async (_source, {id}) => {
        const restaurantId = parseRestaurantId(id);
        if (restaurantId === null) {
          throw new GraphQLError('Restaurant ID must be a positive integer');
        }

        const results = await runQuery(
          `${restaurantSelect} WHERE r.restaurant_id = ? LIMIT 1`,
          [restaurantId],
          'Failed to fetch restaurant',
        );
        return results[0] ?? null;
      },
    },
    restaurants: {
      type: new GraphQLNonNull(RestaurantPageType),
      args: {
        limit: {type: GraphQLInt, defaultValue: 20},
        offset: {type: GraphQLInt, defaultValue: 0},
      },
      resolve: async (_source, {limit, offset}) => {
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
          throw new GraphQLError(
            `limit must be an integer between 1 and ${MAX_PAGE_SIZE}`,
          );
        }
        if (!Number.isInteger(offset) || offset < 0) {
          throw new GraphQLError('offset must be a non-negative integer');
        }

        const countResults = await runQuery(
          'SELECT COUNT(*) AS total_count FROM restaurants',
          [],
          'Failed to fetch restaurants',
        );
        const restaurants = await runQuery(
          `${restaurantSelect}
           ORDER BY r.restaurant_id
           LIMIT ? OFFSET ?`,
          [limit, offset],
          'Failed to fetch restaurants',
        );

        return {
          restaurants,
          totalCount: Number(countResults[0].total_count),
          limit,
          offset,
        };
      },
    },
  },
});

const MutationType = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    addReview: {
      type: ReviewType,
      args: {
        restaurantId: {type: new GraphQLNonNull(GraphQLID)},
        rating: {type: new GraphQLNonNull(GraphQLInt)},
        comment: {type: GraphQLString},
      },
      resolve: async (_source, {restaurantId, rating, comment}, context) => {
        if (!context.user) {
          throw new GraphQLError('Authentication required');
        }

        const parsedRestaurantId = parseRestaurantId(restaurantId);
        if (parsedRestaurantId === null) {
          throw new GraphQLError('Restaurant ID must be a positive integer');
        }
        if (rating < 1 || rating > 5) {
          throw new GraphQLError('Rating must be an integer between 1 and 5');
        }

        const restaurantResults = await runQuery(
          'SELECT restaurant_id FROM restaurants WHERE restaurant_id = ? LIMIT 1',
          [parsedRestaurantId],
          'Failed to add review',
        );
        if (restaurantResults.length === 0) {
          throw new GraphQLError('Restaurant not found');
        }

        const reviewText = comment?.trim() || null;
        const result = await runQuery(
          `INSERT INTO reviews (user_id, restaurant_id, rating, review_text)
           VALUES (?, ?, ?, ?)`,
          [context.user.user_id, parsedRestaurantId, rating, reviewText],
          'Failed to add review',
        );

        return {
          review_id: Number(result.insertId),
          rating,
          review_text: reviewText,
        };
      },
    },
  },
});

module.exports = new GraphQLSchema({
  query: QueryType,
  mutation: MutationType,
});

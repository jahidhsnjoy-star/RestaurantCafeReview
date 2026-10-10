import {API_BASE_URL} from './apiConfig';

export type FavoriteRestaurant = {
  restaurant_id: number;
  name: string;
  description: string;
  category_name: string;
  location: string;
  phone: string;
  opening_time: string;
  closing_time: string;
  price_range: string;
  image: string | null;
};

export type Restaurant = FavoriteRestaurant;

export type PaginatedRestaurants = {
  restaurants: Restaurant[];
  currentPage: number;
  totalPages: number;
  totalRestaurants: number;
  categories: string[];
};

export type RestaurantListOptions = {
  page: number;
  limit: number;
  search: string;
  category: string;
};

export const getRestaurants = async (
  options: RestaurantListOptions,
): Promise<PaginatedRestaurants> => {
  try {
    const params = new URLSearchParams({
      page: String(options.page),
      limit: String(options.limit),
      search: options.search,
      category: options.category,
    });
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants?${params.toString()}`,
    );

    if (!response.ok) {
      throw new Error('Failed to fetch restaurants');
    }

    const data: PaginatedRestaurants = await response.json();

    return data;
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    throw error;
  }
};

export const getRestaurantById = async (
  restaurantId: number,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}`,
    );

    if (!response.ok) {
      throw new Error('Failed to fetch restaurant');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      'Error fetching restaurant details:',
      error,
    );

    throw error;
  }
};

export const getRestaurantReviews = async (
  restaurantId: number,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/reviews`,
    );

    if (!response.ok) {
      throw new Error('Failed to fetch reviews');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      'Error fetching restaurant reviews:',
      error,
    );

    throw error;
  }
};

export const addRestaurantReview = async (
  restaurantId: number,
  userId: number,
  rating: number,
  reviewText: string,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/reviews`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          rating: rating,
          review_text: reviewText,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to add review');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      'Error adding restaurant review:',
      error,
    );

    throw error;
  }
};

export const updateRestaurantReview = async (
  restaurantId: number,
  reviewId: number,
  rating: number,
  reviewText: string,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/reviews/${reviewId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rating: rating,
          review_text: reviewText,
        }),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to update review');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      'Error updating restaurant review:',
      error,
    );

    throw error;
  }
};

export const deleteRestaurantReview = async (
  restaurantId: number,
  reviewId: number,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/reviews/${reviewId}`,
      {
        method: 'DELETE',
      },
    );

    if (!response.ok) {
      throw new Error('Failed to delete review');
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error(
      'Error deleting restaurant review:',
      error,
    );

    throw error;
  }
};

export const addFavorite = async (
  restaurantId: number,
  userId: number = 1,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/favorite`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({user_id: userId}),
      },
    );

    if (!response.ok) {
      throw new Error('Failed to add favorite');
    }

    return await response.json();
  } catch (error) {
    console.error('Error adding favorite:', error);
    throw error;
  }
};

export const removeFavorite = async (
  restaurantId: number,
  userId: number = 1,
) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/favorite?user_id=${userId}`,
      {method: 'DELETE'},
    );

    if (!response.ok) {
      throw new Error('Failed to remove favorite');
    }

    return await response.json();
  } catch (error) {
    console.error('Error removing favorite:', error);
    throw error;
  }
};

export const checkFavorite = async (
  restaurantId: number,
  userId: number = 1,
): Promise<boolean> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/restaurants/${restaurantId}/favorite?user_id=${userId}`,
    );

    if (!response.ok) {
      throw new Error('Failed to check favorite status');
    }

    const data: {isFavorite: boolean} = await response.json();
    return data.isFavorite;
  } catch (error) {
    console.error('Error checking favorite status:', error);
    throw error;
  }
};

export const getFavorites = async (
  userId: number = 1,
): Promise<FavoriteRestaurant[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/favorites?user_id=${userId}`,
    );

    if (!response.ok) {
      throw new Error('Failed to fetch favorites');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching favorites:', error);
    throw error;
  }
};
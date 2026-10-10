import React, {useCallback, useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';

import {WebView} from 'react-native-webview';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {
  getRestaurantById,
  getRestaurantReviews,
  deleteRestaurantReview,
  addFavorite,
  checkFavorite,
  removeFavorite,
} from '../services/restaurantService';

type RootStackParamList = {
  Home: undefined;
  Favorites: undefined;

  RestaurantDetails: {
    restaurantId: number;
  };

  AddReview: {
    restaurantId: number;
  };

  EditReview: {
    restaurantId: number;
    reviewId: number;
    rating: number;
    reviewText: string;
  };
};

type Props = NativeStackScreenProps<
  RootStackParamList,
  'RestaurantDetails'
>;

const getYouTubeEmbedUrl = (videoUrl?: string | null) => {
  const match = videoUrl?.trim().match(
    /^(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i,
  );

  return match
    ? `https://www.youtube.com/embed/${match[1]}?playsinline=1`
    : null;
};

const RestaurantDetailsScreen = ({navigation, route}: Props) => {
  const {restaurantId} = route.params;

  const [restaurant, setRestaurant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);
  const [isFavorite, setIsFavorite] = useState<boolean | null>(null);
  const [favoriteUpdating, setFavoriteUpdating] = useState(false);

  const reviewCount = reviews.length;
  const averageRating =
    reviewCount > 0
      ? (
          reviews.reduce(
            (total, review) => total + Number(review.rating),
            0,
          ) / reviewCount
        ).toFixed(1)
      : null;
  const videoEmbedUrl = getYouTubeEmbedUrl(restaurant?.video_url);
  const mapLatitude = Number(restaurant?.latitude);
  const mapLongitude = Number(restaurant?.longitude);
  const hasMapCoordinates =
    restaurant?.latitude != null &&
    restaurant?.longitude != null &&
    Number.isFinite(mapLatitude) &&
    mapLatitude >= -90 &&
    mapLatitude <= 90 &&
    Number.isFinite(mapLongitude) &&
    mapLongitude >= -180 &&
    mapLongitude <= 180;
  const mapEmbedHtml = hasMapCoordinates
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" /><style>html,body,iframe{width:100%;height:100%;margin:0;border:0;overflow:hidden}</style></head><body><iframe title="Restaurant location" src="https://www.openstreetmap.org/export/embed.html?bbox=${mapLongitude - 0.005}%2C${mapLatitude - 0.005}%2C${mapLongitude + 0.005}%2C${mapLatitude + 0.005}&amp;layer=mapnik&amp;marker=${mapLatitude}%2C${mapLongitude}" allowfullscreen></iframe></body></html>`
    : null;

  const loadRestaurant = useCallback(async () => {
    try {
      const data = await getRestaurantById(restaurantId);

      const reviewData = await getRestaurantReviews(
        restaurantId,
      );

      setRestaurant(data);
      setReviews(reviewData);

      console.log('Restaurant Details:', data);
      console.log('Restaurant Reviews:', reviewData);
    } catch (error) {
      console.error(
        'Restaurant Details Error:',
        error,
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      loadRestaurant();
    }, [loadRestaurant]),
  );

  const loadFavoriteStatus = useCallback(async () => {
    try {
      setIsFavorite(await checkFavorite(restaurantId, 1));
    } catch (error) {
      console.error('Favorite status error:', error);
      Alert.alert('Error', 'Could not load favorite status.');
    }
  }, [restaurantId]);

  useFocusEffect(
    useCallback(() => {
      loadFavoriteStatus();
    }, [loadFavoriteStatus]),
  );

  const toggleFavorite = async () => {
    if (isFavorite === null || favoriteUpdating) {
      return;
    }

    setFavoriteUpdating(true);

    try {
      if (isFavorite) {
        await removeFavorite(restaurantId, 1);
        setIsFavorite(false);
        Alert.alert('Favorites', 'Restaurant removed from favorites.');
      } else {
        await addFavorite(restaurantId, 1);
        setIsFavorite(true);
        Alert.alert('Favorites', 'Restaurant added to favorites.');
      }
    } catch (error) {
      console.error('Favorite update error:', error);
      Alert.alert('Error', 'Could not update favorites. Please try again.');
    } finally {
      setFavoriteUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Top Bar */}
        <View style={styles.topBar}>

          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.5}
            hitSlop={{
              top: 15,
              bottom: 15,
              left: 15,
              right: 15,
            }}
            onPress={() => {
              navigation.goBack();
            }}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.favoriteButton}
            disabled={isFavorite === null || favoriteUpdating}
            accessibilityRole="button"
            accessibilityLabel={
              isFavorite ? 'Remove from Favorites' : 'Add to Favorites'
            }
            onPress={toggleFavorite}>
            <Text style={styles.favoriteLabel}>
              {isFavorite === null
                ? 'Checking...'
                : favoriteUpdating
                  ? 'Updating...'
                  : isFavorite
                    ? '❤️ Remove from Favorites'
                    : '♡ Add to Favorites'}
            </Text>
          </TouchableOpacity>

        </View>

        {/* Restaurant Image / Icon */}
        <View style={styles.imageContainer}>
          <Text style={styles.restaurantEmoji}>☕</Text>
        </View>

        {/* Restaurant Information */}
        <View style={styles.content}>

          <Text style={styles.restaurantName}>
  {restaurant?.name || 'Loading...'}
</Text>

          <Text style={styles.category}>
  {restaurant?.category_name} • {restaurant?.location}
</Text>

          {/* Rating */}
          <View style={styles.ratingRow}>
            <Text style={styles.star}>⭐</Text>

            {averageRating === null ? (
              <>
                <Text style={styles.rating}>New</Text>
                <Text style={styles.reviewCount}>(No reviews)</Text>
              </>
            ) : (
              <>
                <Text style={styles.rating}>{averageRating}</Text>
                <Text style={styles.reviewCount}>
                  ({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})
                </Text>
              </>
            )}
          </View>

          {/* Information Cards */}
          <View style={styles.infoContainer}>

            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>📍</Text>

              <View>
                <Text style={styles.infoTitle}>
                  Location
                </Text>

                <Text style={styles.infoText}>
  {restaurant?.location}
</Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>🕐</Text>

              <View>
                <Text style={styles.infoTitle}>
                  Opening Hours
                </Text>

                <Text style={styles.infoText}>
  {restaurant?.opening_time} - {restaurant?.closing_time}
</Text>
              </View>
            </View>

            <View style={styles.infoItem}>
              <Text style={styles.infoIcon}>💰</Text>

              <View>
                <Text style={styles.infoTitle}>
                  Price Range
                </Text>

                <Text style={styles.infoText}>
  {restaurant?.price_range}
</Text>
              </View>
            </View>

          </View>

          {/* About */}
          <Text style={styles.sectionTitle}>
            About
          </Text>

          <Text style={styles.description}>
  {restaurant?.description}
</Text>

          {videoEmbedUrl && (
            <View style={styles.videoSection}>
              <Text style={styles.sectionTitle}>Video</Text>
              <WebView
                source={{
                  html: `<html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" /><style>html,body{width:100%;height:100%;margin:0;background:#000;overflow:hidden}iframe{width:100%;height:100%;border:0}</style></head><body><iframe src="${videoEmbedUrl}" title="Restaurant video" referrerpolicy="origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></body></html>`,
                  baseUrl: 'https://www.youtube.com/',
                }}
                style={styles.videoPlayer}
                javaScriptEnabled
                domStorageEnabled
                allowsFullscreenVideo
                allowsInlineMediaPlayback
                setSupportMultipleWindows={false}
                onShouldStartLoadWithRequest={({url}) => /^https?:\/\//i.test(url)}
              />
            </View>
          )}

          <View style={styles.mapSection}>
            <Text style={styles.sectionTitle}>Location</Text>
            {mapEmbedHtml ? (
              <WebView
                source={{
                  html: mapEmbedHtml,
                  baseUrl: 'https://www.openstreetmap.org',
                }}
                style={styles.mapPlayer}
                javaScriptEnabled
                domStorageEnabled
              />
            ) : (
              <Text style={styles.locationUnavailable}>
                Location map unavailable
              </Text>
            )}
          </View>

{/* Reviews */}
<Text style={styles.sectionTitle}>
  Reviews
</Text>

{reviews.length === 0 ? (
  <Text style={styles.noReviews}>
    No reviews yet.
  </Text>
) : (
  reviews.map(review => (
    <View
      key={review.review_id}
      style={styles.reviewCard}>

      <Text style={styles.reviewerName}>
        {review.user_name}
      </Text>

      <Text style={styles.reviewRating}>
        {'⭐'.repeat(review.rating)}
      </Text>

      <Text style={styles.reviewText}>
        {review.review_text}
      </Text>

      {Number(review.user_id) === 1 && (
        <TouchableOpacity
          style={styles.editButton}
          onPress={() =>
            navigation.navigate('EditReview', {
              restaurantId: restaurantId,
              reviewId: review.review_id,
              rating: review.rating,
              reviewText: review.review_text,
            })
          }>

          <Text style={styles.editButtonText}>
            ✏️ Edit Review
          </Text>

        </TouchableOpacity>
      )}

      {Number(review.user_id) === 1 && (
  <TouchableOpacity
    style={styles.deleteButton}
    onPress={() => {
      Alert.alert(
        'Delete Review',
        'Are you sure you want to delete this review?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteRestaurantReview(
                  restaurantId,
                  review.review_id,
                );

                Alert.alert(
                  'Review Deleted',
                  'Your review has been deleted successfully.',
                );

                loadRestaurant();
              } catch (error) {
                console.error(
                  'Delete Review Error:',
                  error,
                );

                Alert.alert(
                  'Error',
                  'Failed to delete review. Please try again.',
                );
              }
            },
          },
        ],
      );
    }}>

    <Text style={styles.deleteButtonText}>
      🗑️ Delete Review
    </Text>

  </TouchableOpacity>
)}

    </View>
  ))
)}

          {/* Write Review Button */}
          <TouchableOpacity
  style={styles.reviewButton}
  onPress={() =>
    navigation.navigate('AddReview', {
      restaurantId: restaurantId,
    })
  }>
  <Text style={styles.reviewButtonText}>
    ✍️  Write a Review
  </Text>
</TouchableOpacity>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  topBar: {
    height: 90,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingTop: 30,
  },

  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFF0E5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
    elevation: 10,
  },

  backIcon: {
    fontSize: 38,
    color: '#FF7A00',
    lineHeight: 42,
  },

  favoriteButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    height: 50,
    borderRadius: 22,
    backgroundColor: '#FFF0E5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  favoriteLabel: {
    fontSize: 14,
    color: '#FF7A00',
    fontWeight: '600',
  },

  imageContainer: {
    height: 220,
    backgroundColor: '#FFF5EC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  restaurantEmoji: {
    fontSize: 90,
  },

  content: {
    padding: 20,
  },

  videoSection: {
    marginTop: 22,
    marginBottom: 24,
  },

  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
  },

  mapSection: {
    marginBottom: 24,
  },

  mapPlayer: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
  },

  locationUnavailable: {
    fontSize: 15,
    color: '#777777',
  },

  restaurantName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 6,
  },

  category: {
    fontSize: 16,
    color: '#777777',
    marginBottom: 12,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },

  star: {
    fontSize: 22,
    color: '#FFB000',
    marginRight: 5,
  },

  rating: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginRight: 6,
  },

  reviewCount: {
    fontSize: 15,
    color: '#777777',
  },

  infoContainer: {
    backgroundColor: '#FFF8F3',
    borderRadius: 15,
    padding: 15,
    marginBottom: 25,
  },

  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },

  infoIcon: {
    fontSize: 23,
    marginRight: 15,
  },

  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#555555',
    marginBottom: 3,
  },

  infoText: {
    fontSize: 15,
    color: '#777777',
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 10,
  },

  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#666666',
    marginBottom: 25,
  },

  reviewCard: {
  backgroundColor: '#FFF8F3',
  borderRadius: 12,
  padding: 15,
  marginBottom: 12,
},

editButton: {
  marginTop: 12,
  alignSelf: 'flex-start',
  backgroundColor: '#E67E22',
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 8,
},

editButtonText: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: 'bold',
},

deleteButton: {
  marginTop: 10,
  alignSelf: 'flex-start',
  backgroundColor: '#D9534F',
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 8,
},

deleteButtonText: {
  color: '#FFFFFF',
  fontSize: 14,
  fontWeight: 'bold',
},

reviewerName: {
  fontSize: 16,
  fontWeight: 'bold',
  color: '#222222',
  marginBottom: 5,
},

reviewRating: {
  fontSize: 16,
  marginBottom: 8,
},

reviewText: {
  fontSize: 15,
  color: '#666666',
  lineHeight: 22,
},

noReviews: {
  fontSize: 15,
  color: '#777777',
  marginBottom: 20,
},

  reviewButton: {
    backgroundColor: '#FF7A00',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
  },

  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default RestaurantDetailsScreen;
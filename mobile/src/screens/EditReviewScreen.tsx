import React, {useState} from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';

import {NativeStackScreenProps} from '@react-navigation/native-stack';

import {updateRestaurantReview} from '../services/restaurantService';

type RootStackParamList = {
  RestaurantDetails: undefined;

  EditReview: {
    restaurantId: number;
    reviewId: number;
    rating: number;
    reviewText: string;
  };
};

type Props = NativeStackScreenProps<
  RootStackParamList,
  'EditReview'
>;

const EditReviewScreen = ({navigation, route}: Props) => {
  const {
    restaurantId,
    reviewId,
    rating: oldRating,
    reviewText: oldReviewText,
  } = route.params;

  const [rating, setRating] = useState(oldRating);
  const [review, setReview] = useState(oldReviewText);

  const handleUpdate = async () => {
    if (rating === 0) {
      Alert.alert(
        'Rating Required',
        'Please select a rating.',
      );
      return;
    }

    if (!review.trim()) {
      Alert.alert(
        'Review Required',
        'Please write a review.',
      );
      return;
    }

    try {
      await updateRestaurantReview(
        restaurantId,
        reviewId,
        rating,
        review,
      );

      Alert.alert(
        'Review Updated',
        'Your review has been updated successfully!',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ],
      );
    } catch (error) {
      console.error('Update Review Error:', error);

      Alert.alert(
        'Error',
        'Failed to update review. Please try again.',
      );
    }
  };

  return (
    <SafeAreaView style={styles.container}>

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          Edit Review
        </Text>
      </View>

      <View style={styles.content}>

        <Text style={styles.sectionTitle}>
          Your Rating
        </Text>

        <View style={styles.ratingContainer}>
          {[1, 2, 3, 4, 5].map(star => (
            <TouchableOpacity
              key={star}
              onPress={() => setRating(star)}>

              <Text
                style={[
                  styles.star,
                  {
                    opacity:
                      star <= rating ? 1 : 0.3,
                  },
                ]}>
                ⭐
              </Text>

            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>
          Your Review
        </Text>

        <TextInput
          style={styles.reviewInput}
          placeholder="Write your experience..."
          placeholderTextColor="#999"
          multiline
          textAlignVertical="top"
          value={review}
          onChangeText={setReview}
        />

        <TouchableOpacity
          style={styles.updateButton}
          onPress={handleUpdate}>

          <Text style={styles.updateButtonText}>
            Update Review
          </Text>

        </TouchableOpacity>

      </View>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },

  header: {
    height: 70,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },

  backButton: {
    marginRight: 15,
  },

  backIcon: {
    fontSize: 40,
    color: '#222222',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
  },

  content: {
    padding: 20,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginTop: 10,
    marginBottom: 12,
  },

  ratingContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },

  star: {
    fontSize: 40,
    marginRight: 8,
  },

  reviewInput: {
    height: 150,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 15,
    fontSize: 15,
    color: '#222222',
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },

  updateButton: {
    height: 52,
    backgroundColor: '#E67E22',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },

  updateButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default EditReviewScreen;
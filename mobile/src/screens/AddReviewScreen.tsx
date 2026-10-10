import {addRestaurantReview} from '../services/restaurantService';
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

type RootStackParamList = {
  AddReview: {
    restaurantId: number;
  };
};

type Props = NativeStackScreenProps<
  RootStackParamList,
  'AddReview'
>;

const AddReviewScreen = ({navigation, route}: Props) => {
  const {restaurantId} = route.params;
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');

  const handleSubmit = async () => {
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
    await addRestaurantReview(
      restaurantId,
      1,
      rating,
      review,
    );

    Alert.alert(
      'Review Submitted',
      'Thank you for your review!',
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ],
    );
  } catch (error) {
    console.error('Submit Review Error:', error);

    Alert.alert(
      'Error',
      'Failed to submit review. Please try again.',
    );
  }
};

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>

        <Text style={styles.headerTitle}>
          Write a Review
        </Text>

      </View>

      <View style={styles.content}>

        <Text style={styles.restaurantName}>
          Purni Cafe Aroma
        </Text>

        <Text style={styles.subtitle}>
          How was your experience?
        </Text>

        {/* Rating */}
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
                    opacity: star <= rating ? 1 : 0.3,
                  },
                ]}>
                ⭐
              </Text>

            </TouchableOpacity>
          ))}

        </View>

        {/* Review */}
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

        {/* Submit */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}>

          <Text style={styles.submitButtonText}>
            Submit Review
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
    justifyContent: 'center',
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
  },

  content: {
    padding: 20,
  },

  restaurantName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#222222',
  },

  subtitle: {
    fontSize: 15,
    color: '#777777',
    marginTop: 6,
    marginBottom: 25,
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

  submitButton: {
    height: 52,
    backgroundColor: '#E67E22',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 25,
  },

  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },

});

export default AddReviewScreen;
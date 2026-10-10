import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  FavoriteRestaurant,
  getFavorites,
  removeFavorite,
} from '../services/restaurantService';

type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Favorites: {
    from: 'Home' | 'Profile';
  };
  RestaurantDetails: {
    restaurantId: number;
  };
};

type Props = NativeStackScreenProps<RootStackParamList, 'Favorites'>;

  const FavoritesScreen = ({navigation, route}: Props) => {
  const {from} = route.params;
  const [favorites, setFavorites] = useState<FavoriteRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      setFavorites(await getFavorites(1));
    } catch (loadError) {
      console.error('Favorites screen error:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites]),
  );

  const handleRemove = async (restaurant: FavoriteRestaurant) => {
    setRemovingId(restaurant.restaurant_id);

    try {
      await removeFavorite(restaurant.restaurant_id, 1);
      await loadFavorites();
      Alert.alert('Removed', `${restaurant.name} was removed from favorites.`);
    } catch (removeError) {
      console.error('Remove favorite error:', removeError);
      Alert.alert('Error', 'Could not remove this restaurant from favorites.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
  <TouchableOpacity
    style={styles.backButton}
    accessibilityRole="button"
    accessibilityLabel="Go back"
   onPress={() => {
  if (from === 'Home') {
    navigation.navigate('Home');
  } else {
    navigation.navigate('Profile');
  }
}}>
    <Text style={styles.backIcon}>‹</Text>
  </TouchableOpacity>

  <Text style={styles.title}>Favorites</Text>

  <View style={styles.headerSpacer} />
</View>

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#E67E22" />
          <Text style={styles.stateText}>Loading favorites...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>Could not load favorites.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFavorites}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : favorites.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>No favorite restaurants yet.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}>
          {favorites.map(restaurant => (
            <View key={restaurant.restaurant_id} style={styles.card}>
              <TouchableOpacity
                style={styles.restaurantDetails}
                activeOpacity={0.75}
                onPress={() =>
                  navigation.navigate('RestaurantDetails', {
                    restaurantId: restaurant.restaurant_id,
                  })
                }>
                {restaurant.image ? (
                  <Image
                    source={{uri: restaurant.image}}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.imageFallback}>
                    <Text style={styles.fallbackIcon}>🍽️</Text>
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                  <Text style={styles.category} numberOfLines={1}>
                    {restaurant.category_name}
                  </Text>
                  <Text style={styles.location} numberOfLines={2}>
                    {restaurant.location}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeButton}
                accessibilityLabel={`Remove ${restaurant.name} from favorites`}
                disabled={removingId === restaurant.restaurant_id}
                onPress={() => handleRemove(restaurant)}>
                <Text style={styles.removeText}>
                  {removingId === restaurant.restaurant_id ? '...' : '♥'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  header: {
  minHeight: 72,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 20,
  paddingTop:
    Platform.OS === 'android'
      ? StatusBar.currentHeight || 0
      : 0,
},
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFF0E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: '#FF7A00',
    fontSize: 34,
    lineHeight: 38,
  },
  title: {
    color: '#222222',
    fontSize: 21,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 42,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  card: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  restaurantDetails: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  image: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: '#FFF0E5',
  },
  imageFallback: {
    width: 88,
    height: 88,
    borderRadius: 10,
    backgroundColor: '#FFF0E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackIcon: {
    fontSize: 36,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  name: {
    color: '#222222',
    fontSize: 16,
    fontWeight: 'bold',
  },
  category: {
    color: '#E67E22',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  location: {
    color: '#777777',
    fontSize: 13,
    marginTop: 4,
  },
  removeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  removeText: {
    color: '#E67E22',
    fontSize: 23,
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  stateText: {
    color: '#777777',
    fontSize: 15,
    marginTop: 12,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#FF7A00',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 14,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default FavoritesScreen;
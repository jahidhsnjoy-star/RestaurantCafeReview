import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  getRestaurants,
  Restaurant,
} from '../services/restaurantService';

type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Assistant: undefined;
  Favorites: {
    from: 'Home' | 'Profile';
  };
  RestaurantDetails: {
    restaurantId: number;
  };
};

type Props = NativeStackScreenProps<
  RootStackParamList,
  'Home'
>;

const DEFAULT_CATEGORIES = [
  'Café',
  'Fast Food',
  'Pizza',
  'Restaurant',
  'Bakery',
  'Dessert',
];

const HomeScreen = ({navigation}: Props) => {

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const pageRequestInProgress = useRef(false);

  const categoryOptions = [
    'All',
    ...new Set([
      ...DEFAULT_CATEGORIES,
      ...categories,
    ]),
  ];

  useEffect(() => {
    let isCurrentRequest = true;
    setLoading(true);

    getRestaurants({
      page: currentPage,
      limit: 4,
      search: searchQuery.trim(),
      category: selectedCategory === 'All' ? '' : selectedCategory,
    })
      .then(data => {
        if (!isCurrentRequest) {
          return;
        }

        setRestaurants(data.restaurants);
        setCategories(data.categories);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
      })
      .catch(error => {
        if (isCurrentRequest) {
          console.error('Restaurant API Error:', error);
          setRestaurants([]);
          setTotalPages(0);
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setLoading(false);
          pageRequestInProgress.current = false;
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [currentPage, searchQuery, selectedCategory]);

  const changePage = (page: number) => {
    if (
      loading ||
      pageRequestInProgress.current ||
      page < 1 ||
      page > totalPages ||
      page === currentPage
    ) {
      return;
    }

    pageRequestInProgress.current = true;
    setCurrentPage(page);
  };

  const changeSearchQuery = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const changeCategory = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>

      <ScrollView
        showsVerticalScrollIndicator={false}>

        {/* Header */}

        <View style={styles.header}>

          <View>

            <Text style={styles.headerTitle}>
              Find your favorite place
            </Text>

          </View>

          <TouchableOpacity
            style={styles.profileButton}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => navigation.push('Profile')}>

            <Text style={styles.profileIcon}>
              👤
            </Text>

          </TouchableOpacity>

        </View>

        <TouchableOpacity
          style={styles.assistantButton}
          accessibilityRole="button"
          accessibilityLabel="Open AI restaurant assistant"
          onPress={() => navigation.navigate('Assistant')}>
          <Text style={styles.assistantIcon}>✦</Text>
          <Text style={styles.assistantButtonText}>Ask the restaurant assistant</Text>
          <Text style={styles.assistantArrow}>›</Text>
        </TouchableOpacity>

        {/* Search */}

        <View style={styles.searchContainer}>

          <Text style={styles.searchIcon}>
            🔍
          </Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search restaurants..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={changeSearchQuery}
            returnKeyType="search"
          />

          {searchQuery.length > 0 && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => changeSearchQuery('')}>
              <Text style={styles.clearSearch}>×</Text>
            </TouchableOpacity>
          )}

        </View>

        {/* Categories */}

        <View style={styles.sectionHeader}>

          <Text style={styles.sectionTitle}>
            Categories
          </Text>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              changeSearchQuery('');
              changeCategory('All');
            }}>
            <Text style={styles.seeAll}>Clear</Text>
          </TouchableOpacity>

        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}>

          {categoryOptions.map(category => (
            <TouchableOpacity
              key={category}
              accessibilityRole="button"
              accessibilityState={{selected: selectedCategory === category}}
              style={[
                styles.categoryCard,
                selectedCategory === category && styles.categoryCardSelected,
              ]}
              onPress={() => changeCategory(category)}>
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category && styles.categoryTextSelected,
                ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}

        </ScrollView>

        {/* Popular Places */}

        <View style={styles.sectionHeader}>

          <Text style={styles.sectionTitle}>
            Popular Places
          </Text>

          <TouchableOpacity onPress={() =>
            navigation.navigate('Favorites', {
               from: 'Home',
               })
              }>
            <Text style={styles.seeAll}>Favorites ♡</Text>
          </TouchableOpacity>

        </View>

        {/* Loading */}

        {loading && (
          <View style={styles.loadingContainer}>

            <ActivityIndicator
              size="large"
              color="#E67E22"
            />

            <Text style={styles.loadingText}>
              Loading restaurants...
            </Text>

          </View>
        )}

        {/* Restaurants */}

        {!loading &&
          restaurants.map(restaurant => (

            <TouchableOpacity
  key={restaurant.restaurant_id}
  style={styles.restaurantCard}
  onPress={() =>
    navigation.navigate('RestaurantDetails', {
      restaurantId: restaurant.restaurant_id,
    })
  }>

              {/* Restaurant Image */}

              <View style={styles.restaurantImage}>

                <Text style={styles.restaurantEmoji}>

                  {restaurant.category_name ===
                  'Café'
                    ? '☕'
                    : restaurant.category_name ===
                      'Fast Food'
                    ? '🍔'
                    : restaurant.category_name ===
                      'Pizza'
                    ? '🍕'
                    : restaurant.category_name ===
                      'Bakery'
                    ? '🍰'
                    : '🍽️'}

                </Text>

              </View>

              {/* Restaurant Information */}

              <View style={styles.restaurantInfo}>

                <View style={styles.restaurantTitleRow}>

                  <Text
                    style={styles.restaurantName}
                    numberOfLines={1}>

                    {restaurant.name}

                  </Text>

                  <Text style={styles.favorite}>
                    ♡
                  </Text>

                </View>

                <Text style={styles.restaurantCategory}>

                  {restaurant.category_name}
                  {' • '}
                  {restaurant.location}

                </Text>

                <View style={styles.ratingRow}>

                  <Text style={styles.star}>
                    ⭐
                  </Text>

                  <Text style={styles.rating}>
                    New
                  </Text>

                  <Text style={styles.reviewCount}>
                    (No reviews)
                  </Text>

                </View>

                <Text style={styles.price}>

                  {restaurant.price_range}
                  {' • '}
                  Open until{' '}
                  {restaurant.closing_time}

                </Text>

              </View>

            </TouchableOpacity>

          ))}

        {/* No Restaurants */}

        {!loading &&
          restaurants.length === 0 && (

            <View style={styles.emptyContainer}>

              <Text style={styles.emptyText}>
                No restaurants found.
              </Text>

            </View>

          )}

        {!loading && totalPages > 0 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{disabled: currentPage <= 1}}
              disabled={currentPage <= 1}
              style={[
                styles.paginationButton,
                currentPage <= 1 && styles.paginationButtonDisabled,
              ]}
              onPress={() => changePage(currentPage - 1)}>
              <Text style={styles.paginationButtonText}>Previous</Text>
            </TouchableOpacity>

            <Text style={styles.paginationText}>
              Page {currentPage} of {totalPages}
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{disabled: currentPage >= totalPages}}
              disabled={currentPage >= totalPages}
              style={[
                styles.paginationButton,
                currentPage >= totalPages && styles.paginationButtonDisabled,
              ]}
              onPress={() => changePage(currentPage + 1)}>
              <Text style={styles.paginationButtonText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 15,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#222222',
  },

  assistantButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#F2D2B8',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 20,
    marginBottom: 18,
    paddingHorizontal: 14,
  },

  assistantIcon: {
    color: '#E67E22',
    fontSize: 19,
    marginRight: 10,
  },

  assistantButtonText: {
    flex: 1,
    color: '#333333',
    fontSize: 15,
    fontWeight: '600',
  },

  assistantArrow: {
    color: '#E67E22',
    fontSize: 24,
    marginLeft: 8,
  },

  profileButton: {
    width: 45,
    height: 45,
    borderRadius: 23,
    backgroundColor: '#FFF0E5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  profileIcon: {
    fontSize: 22,
  },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 25,
    paddingHorizontal: 15,
  },

  searchIcon: {
    fontSize: 20,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#222222',
  },

  clearSearch: {
    fontSize: 24,
    lineHeight: 28,
    color: '#777777',
    paddingLeft: 8,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#222222',
  },

  seeAll: {
    fontSize: 14,
    color: '#E67E22',
    fontWeight: '600',
  },

  categoryList: {
    paddingHorizontal: 20,
    paddingBottom: 25,
  },

  categoryCard: {
    minHeight: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },

  categoryCardSelected: {
    backgroundColor: '#E67E22',
    borderColor: '#E67E22',
  },

  categoryText: {
    fontSize: 13,
    color: '#333333',
    fontWeight: '600',
  },

  categoryTextSelected: {
    color: '#FFFFFF',
  },

  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#777777',
  },

  restaurantCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 15,
    borderRadius: 14,
    padding: 12,
  },

  restaurantImage: {
    width: 95,
    height: 105,
    backgroundColor: '#FFF0E5',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  restaurantEmoji: {
    fontSize: 42,
  },

  restaurantInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },

  restaurantTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  restaurantName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#222222',
    flex: 1,
  },

  favorite: {
    fontSize: 26,
    color: '#E67E22',
  },

  restaurantCategory: {
    fontSize: 13,
    color: '#777777',
    marginTop: 5,
  },

  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 7,
  },

  star: {
    fontSize: 14,
  },

  rating: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333333',
    marginLeft: 4,
  },

  reviewCount: {
    fontSize: 12,
    color: '#999999',
    marginLeft: 4,
  },

  price: {
    fontSize: 12,
    color: '#777777',
    marginTop: 6,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },

  pagination: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 24,
  },

  paginationButton: {
    minWidth: 88,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E67E22',
    borderRadius: 8,
    paddingHorizontal: 12,
  },

  paginationButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },

  paginationButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  paginationText: {
    color: '#333333',
    fontSize: 14,
    fontWeight: '600',
  },

  emptyText: {
    fontSize: 16,
    color: '#777777',
  },

});

export default HomeScreen;
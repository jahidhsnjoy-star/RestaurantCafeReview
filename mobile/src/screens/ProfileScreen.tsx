import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {getUserProfile, UserProfile} from '../services/userService';

type RootStackParamList = {
  Home: undefined;
  Profile: undefined;
  Favorites: {
    from: 'Home' | 'Profile';
  };
  Login: undefined;
};

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

const ProfileScreen = ({navigation}: Props) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    setError(false);

    try {
      setProfile(await getUserProfile(1));
    } catch (loadError) {
      console.error('Profile screen error:', loadError);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const confirmLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          navigation.reset({
            index: 0,
            routes: [{name: 'Login'}],
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => navigation.navigate('Home')}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#E67E22" />
          <Text style={styles.stateText}>Loading profile...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>Could not load your profile.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            accessibilityRole="button"
            onPress={loadProfile}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !profile ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>User profile not found.</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.profileSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarIcon}>👤</Text>
            </View>
            <Text style={styles.name}>{profile.name}</Text>
            <Text style={styles.email}>{profile.email}</Text>
          </View>

          <View style={styles.options}>
            <TouchableOpacity
              style={styles.option}
              accessibilityRole="button"
              onPress={() =>
                Alert.alert(
                  'My Reviews',
                  'My Reviews feature will be available soon.',
                )
              }>
              <Text style={styles.optionIcon}>👤</Text>
              <Text style={styles.optionLabel}>My Reviews</Text>
              <Text style={styles.optionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.option}
              accessibilityRole="button"
              onPress={() =>
  navigation.navigate('Favorites', {
    from: 'Profile',
  })
}>
              <Text style={styles.optionIcon}>❤️</Text>
              <Text style={styles.optionLabel}>Favorites</Text>
              <Text style={styles.optionArrow}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.option, styles.logoutOption]}
              accessibilityRole="button"
              onPress={confirmLogout}>
              <Text style={styles.optionIcon}>🚪</Text>
              <Text style={[styles.optionLabel, styles.logoutLabel]}>
                Logout
              </Text>
              <Text style={[styles.optionArrow, styles.logoutLabel]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 26,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFF0E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarIcon: {
    fontSize: 42,
  },
  name: {
    color: '#222222',
    fontSize: 22,
    fontWeight: 'bold',
  },
  email: {
    color: '#777777',
    fontSize: 15,
    marginTop: 6,
  },
  options: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  option: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  optionIcon: {
    width: 38,
    fontSize: 20,
  },
  optionLabel: {
    flex: 1,
    color: '#333333',
    fontSize: 16,
    fontWeight: '600',
  },
  optionArrow: {
    color: '#999999',
    fontSize: 27,
  },
  logoutOption: {
    borderBottomWidth: 0,
  },
  logoutLabel: {
    color: '#D35400',
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
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#E67E22',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
});

export default ProfileScreen;
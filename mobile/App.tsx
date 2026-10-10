import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import HomeScreen from './src/screens/HomeScreen';
import RestaurantDetailsScreen from './src/screens/RestaurantDetailsScreen';
import AddReviewScreen from './src/screens/AddReviewScreen';
import EditReviewScreen from './src/screens/EditReviewScreen';
import FavoritesScreen from './src/screens/FavoritesScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AssistantScreen from './src/screens/AssistantScreen';

const Stack = createNativeStackNavigator();

const App = () => {
  return (
    <SafeAreaProvider>
      <NavigationContainer>

      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
        }}>

        <Stack.Screen
          name="Splash"
          component={SplashScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Login"
          component={LoginScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Register"
          component={RegisterScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Home"
          component={HomeScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Favorites"
          component={FavoritesScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Profile"
          component={ProfileScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="Assistant"
          component={AssistantScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="RestaurantDetails"
          component={
            RestaurantDetailsScreen as React.ComponentType<any>
          }
        />

        <Stack.Screen
          name="AddReview"
          component={AddReviewScreen as React.ComponentType<any>}
        />

        <Stack.Screen
          name="EditReview"
          component={EditReviewScreen as React.ComponentType<any>

          }
        />

      </Stack.Navigator>

      </NavigationContainer>
    </SafeAreaProvider>
  );
};

export default App;
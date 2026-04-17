
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { View, Text, StyleSheet } from "react-native";
import { COLORS } from "../constants";

import HomeScreen from "../screens/user/HomeScreen";
import CollegeBusHomeScreen from "../screens/user/CollegeBusHomeScreen";
import RideTypeSelectionScreen from "../screens/user/RideTypeSelectionScreen";
import BookRideScreen from "../screens/user/BookRideScreen";
import BusBookingScreen from "../screens/user/BusBookingScreen";
import CollegeBusLiveScreen from "../screens/user/CollegeBusLiveScreen";
import RideTrackingScreen from "../screens/user/RideTrackingScreen";
import RideHistoryScreen from "../screens/user/RideHistoryScreen";
import ProfileScreen from "../screens/user/ProfileScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserHome" component={HomeScreen} />
      <Stack.Screen name="CollegeBusHome" component={CollegeBusHomeScreen} />
      <Stack.Screen name="RideTypeSelection" component={RideTypeSelectionScreen} />
      <Stack.Screen name="BookRide" component={BookRideScreen} />
      <Stack.Screen name="BusBooking" component={BusBookingScreen} />
      <Stack.Screen name="CollegeBusLive" component={CollegeBusLiveScreen} />
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} />
    </Stack.Navigator>
  );
}

function BusStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BusBookingHome" component={BusBookingScreen} />
      <Stack.Screen name="CollegeBusLive" component={CollegeBusLiveScreen} />
    </Stack.Navigator>
  );
}

export default function UserNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.gray,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = {
            Home: focused ? "home" : "home-outline",
            Bus: focused ? "bus" : "bus-outline",
            History: focused ? "time" : "time-outline",
            Profile: focused ? "person" : "person-outline",
          };
          return <Ionicons name={icons[route.name]} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Bus" component={BusStack} options={{ title: "Book Bus" }} />
      <Tab.Screen name="History" component={RideHistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.white,
    borderTopWidth: 0,
    height: 60,
    paddingBottom: 8,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
  },
  tabLabel: { fontSize: 11, fontWeight: "600" },
});

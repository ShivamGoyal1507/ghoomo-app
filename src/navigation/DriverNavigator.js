
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useSelector } from "react-redux";
import DriverHomeScreen from "../screens/driver/DriverHomeScreen";
import BusDriverScreen from "../screens/driver/BusDriverScreen";
import BusDriverRouteScreen from "../screens/driver/BusDriverRouteScreen";
import DriverHistoryScreen from "../screens/driver/DriverHistoryScreen";
import DriverProfileScreen from "../screens/driver/DriverProfileScreen";
import DriverOtpScreen from "../screens/driver/DriverOtpScreen";
import { COLORS } from "../constants";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.grayDark,
        tabBarStyle: {
          backgroundColor: COLORS.white,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          height: 62,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tab.Screen
        name="DriverHomeTab"
        component={DriverHomeScreen}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="car-sport" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="DriverHistory"
        component={DriverHistoryScreen}
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="DriverProfile"
        component={DriverProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function DriverNavigator() {
  const user = useSelector(s => s.auth.user);
  const isBusDriver = user?.vehicleType === "bus" || Boolean(user?.busRoute);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isBusDriver ? (
        <>
          <Stack.Screen name="BusDriver" component={BusDriverScreen} />
          <Stack.Screen name="BusDriverRoute" component={BusDriverRouteScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="DriverTabs" component={DriverTabs} />
          <Stack.Screen name="DriverOtp" component={DriverOtpScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

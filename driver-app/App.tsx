/**
 * Movido Driver App — Main entry point
 * Auth-gated navigation with all screens registered
 */

import React from "react";
import { StatusBar, ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useDriverAuth } from "./src/hooks/useDriverAuth";

import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import JobDetailScreen from "./src/screens/JobDetailScreen";
import TruckCheckScreen from "./src/screens/TruckCheckScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import DocumentScannerScreen from "./src/screens/DocumentScannerScreen";
import SignatureScreen from "./src/screens/SignatureScreen";
import IncidentReportScreen from "./src/screens/IncidentReportScreen";
import FuelLogScreen from "./src/screens/FuelLogScreen";
import MapScreen from "./src/screens/MapScreen";
import WTDScreen from "./src/screens/WTDScreen";

const DarkTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#00FFD4",
    background: "#0a0a0f",
    card: "#111118",
    text: "#ffffff",
    border: "#1a1a24",
    notification: "#EF4444",
  },
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#111118",
          borderTopColor: "#1a1a24",
          height: 80,
          paddingBottom: 20,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#00FFD4",
        tabBarInactiveTintColor: "#555",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused, color }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Home")       iconName = focused ? "home" : "home-outline";
          if (route.name === "Messages")   iconName = focused ? "chatbubble" : "chatbubble-outline";
          if (route.name === "TruckCheck") iconName = focused ? "shield-checkmark" : "shield-checkmark-outline";
          if (route.name === "Profile")    iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Messages" component={MessagesScreen} />
      <Tab.Screen name="TruckCheck" component={TruckCheckScreen} options={{ title: "Truck Check" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const { isAuthenticated, isLoading } = useDriverAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0f", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#00FFD4" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main"            component={HomeTabs} />
            <Stack.Screen name="JobDetail"       component={JobDetailScreen} />
            <Stack.Screen name="DocumentScanner" component={DocumentScannerScreen} />
            <Stack.Screen name="Signature"       component={SignatureScreen} />
            <Stack.Screen name="IncidentReport"  component={IncidentReportScreen} />
            <Stack.Screen name="FuelLog"         component={FuelLogScreen} />
            <Stack.Screen name="Map"             component={MapScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="WTD"             component={WTDScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/**
 * usePushNotifications — Expo Push Notification setup
 * Registers device, saves token to Supabase drivers table.
 * Handles foreground notification display.
 */

import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "../lib/supabase";

// Show notifications while app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(driverId: number | undefined) {
  const notifListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!driverId) return;

    registerAndSaveToken(driverId);

    // Listen for foreground notifications
    notifListenerRef.current = Notifications.addNotificationReceivedListener((_notification) => {
      // Notification received while app is in foreground — handled by setNotificationHandler above
    });

    // Listen for notification taps
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((_response) => {
      // Handle notification tap — extend here to navigate to relevant screen
    });

    return () => {
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [driverId]);
}

async function registerAndSaveToken(driverId: number) {
  if (!Device.isDevice) return; // simulators don't support push

  // Request permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  // Android channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Movido Driver",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00FFD4",
    });
  }

  // Get Expo push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (!token) return;

  // Save to Supabase
  await supabase
    .from("drivers")
    .update({ push_token: token })
    .eq("id", driverId);
}

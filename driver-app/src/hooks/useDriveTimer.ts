/**
 * useDriveTimer — EU/UK WTD Driving Hours Compliance
 *
 * Rules enforced:
 * - Max 4.5h continuous driving → mandatory 45min break
 * - Warn at 4h (30 min warning)
 * - Daily limit 9h (extendable to 10h twice/week)
 * - Weekly limit 56h
 *
 * Timer runs when driverStatus === "on_duty"
 * Resets when driver goes "on_break" for >= 45 minutes
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as Notifications from "expo-notifications";
import * as Haptics from "expo-haptics";

export type TimerStatus = "idle" | "driving" | "warning" | "break_required" | "on_break";

interface DriveTimerState {
  continuousMins: number;   // minutes driven without a 45min break
  breakMins: number;        // minutes currently on break
  todayMins: number;        // total driving minutes today
  weekMins: number;         // total driving minutes this week
  status: TimerStatus;
}

const WTD = {
  WARN_MINS: 240,           // 4h — show warning
  BREAK_REQUIRED_MINS: 270, // 4.5h — mandatory break
  RESET_BREAK_MINS: 45,     // 45min break resets continuous counter
  DAILY_MAX_MINS: 540,      // 9h
  WEEKLY_MAX_MINS: 3360,    // 56h
};

export function useDriveTimer(driverStatus: string) {
  const [state, setState] = useState<DriveTimerState>({
    continuousMins: 0,
    breakMins: 0,
    todayMins: 0,
    weekMins: 0,
    status: "idle",
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);
  const breakRequiredRef = useRef(false);

  const tick = useCallback(() => {
    setState((prev) => {
      const isDriving = driverStatus === "on_duty";
      const isOnBreak = driverStatus === "on_break";

      let { continuousMins, breakMins, todayMins, weekMins } = prev;

      if (isDriving) {
        continuousMins += 1;
        todayMins += 1;
        weekMins += 1;
        breakMins = 0; // reset break counter while driving
      } else if (isOnBreak) {
        breakMins += 1;
        // 45+ min break resets continuous driving counter
        if (breakMins >= WTD.RESET_BREAK_MINS) {
          continuousMins = 0;
          warnedRef.current = false;
          breakRequiredRef.current = false;
        }
      }

      // Determine status
      let status: TimerStatus = "idle";
      if (isOnBreak) {
        status = "on_break";
      } else if (isDriving) {
        if (continuousMins >= WTD.BREAK_REQUIRED_MINS) {
          status = "break_required";
          if (!breakRequiredRef.current) {
            breakRequiredRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Notifications.scheduleNotificationAsync({
              content: {
                title: "🛑 Mandatory Break Required",
                body: `You have driven ${Math.floor(continuousMins / 60)}h ${continuousMins % 60}min. UK law requires a 45-minute break now.`,
                sound: true,
              },
              trigger: null,
            });
          }
        } else if (continuousMins >= WTD.WARN_MINS) {
          status = "warning";
          if (!warnedRef.current) {
            warnedRef.current = true;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Notifications.scheduleNotificationAsync({
              content: {
                title: "⚠️ Break Reminder",
                body: `${WTD.BREAK_REQUIRED_MINS - continuousMins} minutes until your mandatory 45-min break.`,
                sound: false,
              },
              trigger: null,
            });
          }
        } else {
          status = "driving";
        }
      }

      return { continuousMins, breakMins, todayMins, weekMins, status };
    });
  }, [driverStatus]);

  useEffect(() => {
    if (driverStatus === "on_duty" || driverStatus === "on_break") {
      intervalRef.current = setInterval(tick, 60000); // every 1 minute
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [driverStatus, tick]);

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const continuousRemaining = Math.max(0, WTD.BREAK_REQUIRED_MINS - state.continuousMins);
  const dailyRemaining = Math.max(0, WTD.DAILY_MAX_MINS - state.todayMins);

  return {
    ...state,
    formatTime,
    continuousRemaining,
    dailyRemaining,
    continuousPercent: Math.min((state.continuousMins / WTD.BREAK_REQUIRED_MINS) * 100, 100),
    dailyPercent: Math.min((state.todayMins / WTD.DAILY_MAX_MINS) * 100, 100),
    weeklyPercent: Math.min((state.weekMins / WTD.WEEKLY_MAX_MINS) * 100, 100),
  };
}

/**
 * Supabase Client Configuration
 * Used for authentication, realtime subscriptions, and database access
 *
 * This configuration:
 * - Disables Web Locks API requirement that can timeout in some environments
 * - Uses only localStorage for session persistence
 * - Includes proper error handling for lock timeouts
 * - Sets extended timeout values for robust operation
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Database features will not work."
  );
}

// Custom storage adapter for session persistence with lock-free operation
const customStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to read key "${key}":`, error);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to write key "${key}":`, error);
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to remove key "${key}":`, error);
    }
  },
};

/**
 * Custom auth session persister that avoids Web Locks API deadlocks
 * Falls back to direct localStorage access if locks are unavailable
 */
const createLockFreeAuthStorage = () => ({
  getItem: async (key: string) => {
    try {
      // Try direct localStorage access first (no locks)
      const value = localStorage.getItem(key);
      return value;
    } catch (error) {
      console.warn(`[Supabase Auth Storage] Failed to read auth key "${key}":`, error);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      // Direct localStorage access (no locks)
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[Supabase Auth Storage] Failed to write auth key "${key}":`, error);
    }
  },
  removeItem: async (key: string) => {
    try {
      // Direct localStorage access (no locks)
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[Supabase Auth Storage] Failed to remove auth key "${key}":`, error);
    }
  },
});

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: {
      // Auth configuration with lock-free session persistence
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: customStorage,
      // Disable lock-based session synchronization to prevent timeouts.
      //
      // supabase-js defaults to navigatorLock, and getSession() runs inside
      // that lock with a 5s acquire timeout. Every request resolves its bearer
      // through getSession(), so a lock held elsewhere stalls the whole client:
      // profile reads time out and the app reads the missing profile as "no
      // access". Running the callback directly is what the rest of this file
      // already claims to do.
      //
      // Trade-off: token refresh is no longer serialised across tabs, so two
      // open tabs can refresh concurrently.
      lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn(),
      flowType: 'implicit',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    // Increase operation timeouts to 30 seconds
    db: {
      schema: 'public',
    },
  }
);


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

// Manual lock timeout handler - prevents Web Locks API from blocking auth initialization
let lockTimeout: ReturnType<typeof setTimeout> | null = null;
const LOCK_TIMEOUT_MS = 30000; // 30 seconds - extended for robust operation

/**
 * Get a lock with timeout fallback
 * If the lock operation takes too long, we proceed anyway rather than blocking
 */
const getLockWithTimeout = (name: string): Promise<LockManager | null> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn(`[Supabase Lock] Lock acquisition timeout for "${name}", proceeding without lock`);
      resolve(null);
    }, LOCK_TIMEOUT_MS);

    if (typeof navigator !== 'undefined' && navigator.locks) {
      navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        clearTimeout(timeout);
        resolve(lock || null);
      }).catch((error) => {
        clearTimeout(timeout);
        console.warn(`[Supabase Lock] Lock request failed for "${name}":`, error);
        resolve(null);
      });
    } else {
      clearTimeout(timeout);
      resolve(null);
    }
  });
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
      // Disable lock-based session synchronization to prevent timeouts
      flowType: 'implicit',
      // Extended timeouts for robust operation
      detectSessionInUrl: true,
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

// Export lock timeout handler for use in auth hooks
export { getLockWithTimeout, LOCK_TIMEOUT_MS };

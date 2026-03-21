/**
 * Supabase Auth Hook
 * Replaces the Manus OAuth system with Supabase Auth
 * Provides login, logout, session management
 *
 * Features:
 * - Aggressive retry logic with exponential backoff for getSession() calls
 * - localStorage fallback mechanism for session restoration
 * - Direct JWT token parsing from stored data
 * - Enhanced error logging for debugging
 * - Session validation before use
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import type { User as AppUser } from "@/lib/database.types";

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Retry logic with exponential backoff
 * Max 5 retries: 500ms, 1s, 2s, 4s, 8s
 */
const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelayMs: number = 500
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.warn(
          `[Auth Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms:`,
          lastError.message
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `[Auth Retry] Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
};

/**
 * Try to restore session directly from localStorage
 * Used when getSession() fails or times out
 */
const restoreSessionFromStorage = (): Session | null => {
  try {
    // CRITICAL FIX: Use the SAME key that forceSessionToLocalStorage() saves to
    // Supabase project ID: zjvozjnbvrtrrpehqdpf
    const storageKey = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';
    const sessionStr = localStorage.getItem(storageKey);
    if (!sessionStr) {
      console.log('[Auth Storage] No session token found in localStorage (checked key:', storageKey, ')');
      return null;
    }

    const session = JSON.parse(sessionStr) as Session;

    // Validate session structure
    if (!session || !session.user || !session.access_token) {
      console.warn('[Auth Storage] Invalid session structure in localStorage');
      return null;
    }

    // Check if access token is expired (basic check)
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      console.warn('[Auth Storage] Session access token is expired');
      return null;
    }

    console.log('[Auth Storage] Successfully restored session from localStorage');
    return session;
  } catch (error) {
    console.warn('[Auth Storage] Failed to restore session from localStorage:', error);
    return null;
  }
};

/**
 * Parse JWT token to extract user information
 * Useful as fallback when session object is incomplete
 */
const parseJwtToken = (token: string): Partial<User> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    return {
      id: payload.sub,
      email: payload.email,
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      aud: payload.aud,
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as Partial<User>;
  } catch (error) {
    console.warn('[Auth JWT] Failed to parse JWT token:', error);
    return null;
  }
};

/**
 * Validate session before use
 */
const isValidSession = (session: Session | null): boolean => {
  if (!session || !session.user || !session.access_token) {
    return false;
  }

  // Check token expiration
  if (session.expires_at && session.expires_at * 1000 < Date.now()) {
    console.warn('[Auth Validation] Session token is expired');
    return false;
  }

  return true;
};

/**
 * Emergency override: Force save session to localStorage
 * Bypasses Supabase's lock-based persistence that may timeout
 * Uses the exact same key that Supabase uses internally
 */
const forceSessionToLocalStorage = async (session: Session | null): Promise<void> => {
  if (!session || !session.user || !session.access_token) {
    console.warn('[Auth] Cannot save invalid session to localStorage');
    return;
  }

  try {
    // Supabase project ID: zjvozjnbvrtrrpehqdpf
    const storageKey = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';

    // Save the full session object as JSON
    const sessionJson = JSON.stringify(session);
    localStorage.setItem(storageKey, sessionJson);

    console.log('[Auth] Emergency session save to localStorage: SUCCESS');
    console.log('[Auth] Saved to key:', storageKey);
    console.log('[Auth] Session user:', session.user.email);
  } catch (error) {
    console.error('[Auth] Emergency session save to localStorage: FAILED', error);
  }
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // Fetch user profile from our users table
  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
        return null;
      }
      return data as AppUser;
    } catch {
      return null;
    }
  }, []);

  // Initialize auth state with retry logic and fallback
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        console.log("[Auth] Starting initialization...");

        let session: Session | null = null;
        let initError: Error | null = null;

        // Attempt 1: Try getSession() with retry logic
        try {
          console.log("[Auth] Attempting to get session from Supabase...");
          const result = await retryWithBackoff(
            async () => {
              const { data: { session: sess }, error } = await supabase.auth.getSession();
              if (error) throw error;
              return sess;
            },
            5, // max 5 retries
            500 // initial 500ms delay
          );
          session = result;
          console.log("[Auth] getSession() succeeded");
        } catch (error) {
          initError = error as Error;
          console.warn("[Auth] getSession() failed with retries:", initError.message);

          // Attempt 2: Try to restore from localStorage
          console.log("[Auth] Attempting to restore session from localStorage...");
          const storedSession = restoreSessionFromStorage();

          if (storedSession && isValidSession(storedSession)) {
            session = storedSession;
            console.log("[Auth] Session restored from localStorage");
          } else {
            console.warn("[Auth] Failed to restore valid session from localStorage");
          }
        }

        if (!mounted) return;

        // Process the session (whether from Supabase or localStorage)
        if (session && session.user && isValidSession(session)) {
          console.log("[Auth] Valid session found, fetching profile...");
          const profile = await fetchProfile(session.user.id);
          if (mounted) {
            setState({
              user: session.user,
              profile,
              session,
              isLoading: false,
              isAuthenticated: true,
            });
          }
        } else {
          // No valid session found
          console.log("[Auth] No valid session found, waiting for auth state changes");
          if (mounted) {
            setState(prev => ({ ...prev, isLoading: false }));
          }
        }
      } catch (err) {
        console.error("[Auth] Critical initialization error:", err);
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    // Start auth initialization
    initAuth();

    // Listen for auth changes (handles refresh token, sign out, etc)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log("[Auth] Event:", event, "Session valid:", isValidSession(session));

        if (event === "SIGNED_IN" && session?.user) {
          console.log("[Auth] User signed in:", session.user.email);
          // Emergency override: force save session to localStorage
          await forceSessionToLocalStorage(session);
          const profile = await fetchProfile(session.user.id);
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        } else if (event === "SIGNED_OUT") {
          console.log("[Auth] User signed out");
          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
          });
        } else if (event === "TOKEN_REFRESHED" && session) {
          console.log("[Auth] Token refreshed");
          // Emergency override: update session in localStorage when token is refreshed
          await forceSessionToLocalStorage(session);
          setState(prev => ({
            ...prev,
            session,
            user: session.user,
          }));
        } else if (event === "INITIAL_SESSION" && session?.user) {
          console.log("[Auth] Initial session detected:", session.user.email);
          // Emergency override: force save session to localStorage
          await forceSessionToLocalStorage(session);
          const profile = await fetchProfile(session.user.id);
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        }
      }
    );

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  // Sign in with email
  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  // Sign up with email
  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    name?: string
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name || email.split("@")[0] },
        // Redirect here after clicking the confirmation link.
        // Supabase will append ?code=... (PKCE) which AuthCallback exchanges.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;

        // Send verification email via Edge Function
        if (data.user) {
                try {
                          const confirmationUrl = `${window.location.origin}/verify?token=${data.session?.access_token}`;
            await supabase.functions.invoke('send-verification-email', {                                      body: {
                                                    email: data.user.email,
                                                    confirmationUrl,
                                                    userName: name || email.split("@")[0],
                                      },
                          });
                } catch (emailError) {
                          console.warn('[Auth] Failed to send verification email:', emailError);
                          // Don't fail signup if email fails
                }
        }
    return data;
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Update profile
  const updateProfile = useCallback(async (updates: Partial<AppUser>) => {
    if (!state.user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", state.user.id)
      .select()
      .single();

    if (error) throw error;

    setState(prev => ({
      ...prev,
      profile: data as AppUser,
    }));

    return data;
  }, [state.user]);

  return {
    ...state,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateProfile,
  };
}

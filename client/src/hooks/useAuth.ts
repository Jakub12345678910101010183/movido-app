/**
 * Supabase Auth Hook
 * Simplified and robust auth state management
 * Uses getSession on mount + onAuthStateChange for updates
 */

import { useState, useEffect, useCallback, useRef } from "react";
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

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const mountedRef = useRef(true);

  // Fetch user profile from our users table
  const fetchProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single()
        .abortSignal(controller.signal);

      clearTimeout(timeout);

      if (error) {
        console.warn("[Auth] Profile fetch error:", error.message);
        return null;
      }
      return data as AppUser;
    } catch (err: any) {
      console.warn("[Auth] Profile fetch failed:", err?.message || err);
      return null;
    }
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        console.log("[Auth] Initializing...");
        // Use a small delay to allow Supabase to recover session from storage
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn("[Auth] getSession error:", error.message);
        }

        if (!mountedRef.current) return;

        if (session?.user) {
          console.log("[Auth] Session found for:", session.user.email);
          const profile = await fetchProfile(session.user.id);
          if (!mountedRef.current) return;
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        } else {
          console.log("[Auth] No session found in getSession");
          // Final check: if we're on dashboard, try one more time or force unauthenticated
          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      } catch (err) {
        console.error("[Auth] Init error:", err);
        if (mountedRef.current) {
          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
          });
        }
      }
    };

    // Safety timeout — force loading to false after 6 seconds
    const safetyTimeout = setTimeout(() => {
      if (mountedRef.current) {
        setState(prev => {
          if (prev.isLoading) {
            console.warn("[Auth] Safety timeout: forcing isLoading to false");
            return { ...prev, isLoading: false };
          }
          return prev;
        });
      }
    }, 6000);

    // Start initialization
    init();

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mountedRef.current) return;
        console.log("[Auth] Event:", event, session?.user?.email);

        if (event === "SIGNED_IN" && session?.user) {
          const profile = await fetchProfile(session.user.id);
          if (!mountedRef.current) return;
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        } else if (event === "SIGNED_OUT") {
          setState({
            user: null,
            profile: null,
            session: null,
            isLoading: false,
            isAuthenticated: false,
          });
        } else if (event === "TOKEN_REFRESHED" && session) {
          setState(prev => ({
            ...prev,
            session,
            user: session.user,
          }));
        }
      }
    );

    return () => {
      mountedRef.current = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array — only run once on mount

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
      },
    });
    if (error) throw error;
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
      .update(updates as any)
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

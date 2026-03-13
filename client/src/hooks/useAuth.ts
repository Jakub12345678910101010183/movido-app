/**
 * Supabase Auth Hook
 * Replaces the Manus OAuth system with Supabase Auth
 * Provides login, logout, session management
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

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const profile = await fetchProfile(session.user.id);
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        } else if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      } catch {
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === "SIGNED_IN" && session?.user) {
          const profile = await fetchProfile(session.user.id);
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
      mounted = false;
      subscription.unsubscribe();
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

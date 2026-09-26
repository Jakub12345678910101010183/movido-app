/**
 * Supabase Auth Hook - FIXED: Navigator Lock Timeout
 * Adds 8-second hard timeout to prevent infinite loading
 * when navigator.locks gets stuck between sessions.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";
import type { User as AppUser } from "@/lib/database.types";

/**
 * Where the profile read stands. "loading" is not the same answer as "this
 * account has no role": the first must never deny access, the second must.
 */
export type ProfileStatus = "idle" | "loading" | "loaded" | "error";

interface AuthState {
  user: User | null;
  profile: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profileStatus: ProfileStatus;
}

const STORAGE_KEY = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';

const clearStuckLock = () => {
  try {
    Object.keys(localStorage)
      .filter(k => k.includes('supabase') || k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

/**
 * Reads the session, reporting whether the read itself failed.
 *
 * `timedOut` matters: getSession() goes through the Web Locks API, so a lock
 * held elsewhere hangs it. A read that never answered says nothing about
 * whether a session exists, and must not be mistaken for "signed out" — that
 * mistake used to wipe a perfectly valid token out of localStorage.
 */
type SessionRead = { session: Session | null; timedOut: boolean };

const getSessionWithTimeout = (timeoutMs = 8000): Promise<SessionRead> => {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; console.warn('[Auth] getSession() timed out — falling back to stored session'); resolve({ session: null, timedOut: true }); }
    }, timeoutMs);
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve({ session: error ? null : session, timedOut: Boolean(error) }); }
      })
      .catch(() => { if (!resolved) { resolved = true; clearTimeout(timer); resolve({ session: null, timedOut: true }); } });
  });
};

const restoreSessionFromStorage = (): Session | null => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const session = JSON.parse(s) as Session;
    if (!session?.user || !session?.access_token) return null;
    if (session.expires_at && session.expires_at * 1000 < Date.now()) return null;
    return session;
  } catch { return null; }
};

const isValidSession = (s: Session | null): boolean =>
  !!(s?.user && s?.access_token && !(s.expires_at && s.expires_at * 1000 < Date.now()));

const saveSession = (s: Session | null): void => {
  if (!s?.user || !s?.access_token) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null, profile: null, session: null, isLoading: true, isAuthenticated: false,
    profileStatus: "idle",
  });

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const read = await getSessionWithTimeout(8000);
        const session = read.session ?? restoreSessionFromStorage();
        if (!session || !isValidSession(session)) {
          // Only clear when the read actually answered "no session". After a
          // failed read the stored token may still be good, and clearing it
          // would sign the user out for no reason.
          if (!read.timedOut) clearStuckLock();
          if (mounted) setState(prev => ({ ...prev, isLoading: false }));
          return;
        }
        if (!mounted) return;
        saveSession(session);
        // The profile is read by its own effect, never from here. A query
        // issued on this path resolves its bearer through auth.getSession(),
        // which waits on the very initialisation this code is part of, so the
        // request would never reach the network.
        if (mounted) {
          setState({
            user: session.user, profile: null, session,
            isLoading: false, isAuthenticated: true, profileStatus: "loading",
          });
        }
      } catch {
        clearStuckLock();
        if (mounted) setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();

    // Deliberately synchronous. supabase-js awaits every state-change callback
    // (_notifyAllSubscribers does `await Promise.all(...)`) and emits
    // INITIAL_SESSION from inside its own initialisation lock, so anything
    // awaited here holds up the client that the awaited call itself depends on.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        saveSession(session);
        const nextUser = session.user;
        setState(prev => ({
          ...prev,
          user: nextUser,
          session,
          isLoading: false,
          isAuthenticated: true,
          // Keep a profile already loaded for this same account; a different
          // account starts over.
          profile: prev.user?.id === nextUser.id ? prev.profile : null,
          profileStatus:
            prev.user?.id === nextUser.id && prev.profileStatus === "loaded"
              ? "loaded"
              : "loading",
        }));
      } else if (event === 'TOKEN_REFRESHED' && session) {
        saveSession(session);
        setState(prev => ({ ...prev, session, user: session.user }));
      } else if (event === 'SIGNED_OUT') {
        clearStuckLock();
        setState({
          user: null, profile: null, session: null,
          isLoading: false, isAuthenticated: false, profileStatus: "idle",
        });
      }
    });

    return () => { mounted = false; subscription?.unsubscribe(); };
  }, []);

  // Profile read, on its own effect.
  //
  // This runs after render, outside supabase-js's initialisation and outside
  // its state-change notification, so auth.getSession() is already settled by
  // the time the query resolves its bearer and the request actually goes out.
  // There is no timeout race here: a slow answer is still an answer, and the
  // outcome is recorded as a status rather than silently becoming "no role".
  const userId = state.user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let active = true;

    void (async () => {
      // A transient network failure must not look like "no role": retry a
      // request that failed before giving up. A missing row is not retried.
      let { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
      for (let attempt = 1; error && attempt <= 3 && active; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        if (!active) return;
        ({ data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle());
      }

      if (!active) return;
      setState(prev => {
        if (prev.user?.id !== userId) return prev;
        if (error || !data) {
          return { ...prev, profile: null, profileStatus: "error" };
        }
        return { ...prev, profile: data as AppUser, profileStatus: "loaded" };
      });
    })();

    return () => { active = false; };
  }, [userId]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, name?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { name: name || email.split('@')[0] }, emailRedirectTo: window.location.origin + '/auth/callback' },
    });
    if (error) throw error;
    return data;
  }, []);

  /**
   * Sends a recovery link. The outcome is deliberately not reported back in a
   * way that distinguishes a known address from an unknown one — callers show
   * the same message either way. Nothing about the request is logged.
   */
  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  /** Sets a new password on the session the caller already holds. */
  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(async (updates: Partial<AppUser>) => {
    if (!state.user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('users').update(updates).eq('id', state.user.id).select().single();
    if (error) throw error;
    setState(prev => ({ ...prev, profile: data as AppUser, profileStatus: "loaded" }));
    return data;
  }, [state.user]);

  return {
    ...state,
    signInWithEmail,
    signUpWithEmail,
    requestPasswordReset,
    updatePassword,
    signOut,
    updateProfile,
  };
}

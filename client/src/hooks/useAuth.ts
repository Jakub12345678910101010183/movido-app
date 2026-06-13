/**
 * Supabase Auth Hook - FIXED: Navigator Lock Timeout
 * Adds 8-second hard timeout to prevent infinite loading
 * when navigator.locks gets stuck between sessions.
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

const STORAGE_KEY = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';

const clearStuckLock = () => {
  try {
    Object.keys(localStorage)
      .filter(k => k.includes('supabase') || k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

const getSessionWithTimeout = (timeoutMs = 8000): Promise<Session | null> => {
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; console.warn('[Auth] getSession() timed out — clearing stuck lock'); resolve(null); }
    }, timeoutMs);
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(error ? null : session); }
      })
      .catch(() => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } });
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
  });

  const fetchProfile = useCallback(async (userId: string): Promise<AppUser | null> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.warn('[Auth] fetchProfile() timed out — proceeding without profile');
        resolve(null);
      }, 5000);
      supabase.from("users").select("*").eq("id", userId).single()
        .then(({ data, error }) => { clearTimeout(timer); resolve(error ? null : data as AppUser); })
        .catch(() => { clearTimeout(timer); resolve(null); });
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        let session = await getSessionWithTimeout(8000);
        if (!session) session = restoreSessionFromStorage();
        if (!session || !isValidSession(session)) {
          clearStuckLock();
          if (mounted) setState(prev => ({ ...prev, isLoading: false }));
          return;
        }
        if (!mounted) return;
        saveSession(session);
        const profile = await fetchProfile(session.user.id);
        if (mounted) setState({ user: session.user, profile, session, isLoading: false, isAuthenticated: true });
      } catch {
        clearStuckLock();
        if (mounted) setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        saveSession(session);
        const profile = await fetchProfile(session.user.id);
        if (mounted) setState({ user: session.user, profile, session, isLoading: false, isAuthenticated: true });
      } else if (event === 'TOKEN_REFRESHED' && session) {
        saveSession(session);
        if (mounted) setState(prev => ({ ...prev, session, user: session.user }));
      } else if (event === 'SIGNED_OUT') {
        clearStuckLock();
        if (mounted) setState({ user: null, profile: null, session: null, isLoading: false, isAuthenticated: false });
      }
    });

    return () => { mounted = false; subscription?.unsubscribe(); };
  }, [fetchProfile]);

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

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(async (updates: Partial<AppUser>) => {
    if (!state.user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('users').update(updates).eq('id', state.user.id).select().single();
    if (error) throw error;
    setState(prev => ({ ...prev, profile: data as AppUser }));
    return data;
  }, [state.user]);

  return { ...state, signInWithEmail, signUpWithEmail, signOut, updateProfile };
}

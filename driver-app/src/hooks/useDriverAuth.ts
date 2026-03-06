/**
 * Auth hook for Movido Driver App
 * Handles login, session, and driver profile
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface DriverProfile {
  id: number;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  license_type: string | null;
  vehicle_id: number | null;
}

export function useDriverAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch driver profile
  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("drivers")
      .select("*")
      .eq("user_id", userId)
      .single();
    if (data) setProfile(data as DriverProfile);
  }, []);

  // Init session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    // Set driver status to off_duty before signing out
    if (profile) {
      await supabase.from("drivers").update({ status: "off_duty" }).eq("id", profile.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
  }, [profile]);

  const updateStatus = useCallback(async (status: string) => {
    if (!profile) return;
    await supabase.from("drivers").update({ status }).eq("id", profile.id);
    setProfile((prev) => prev ? { ...prev, status } : null);
  }, [profile]);

  return {
    user, session, profile, isLoading,
    isAuthenticated: !!session,
    signIn, signOut, updateStatus, fetchProfile,
  };
}

/**
 * Auth Context Provider
 * Wraps the app with authentication state
 * Provides login/logout and protected route support
 */

import { createContext, useContext, type ReactNode } from "react";
import { useAuth, type ProfileStatus } from "@/hooks/useAuth";
import NoDispatchAccess from "@/pages/NoDispatchAccess";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";
import type { User as AppUser } from "@/lib/database.types";

/**
 * The roles the database allows on public.users (CHECK users_role_check).
 * Anything else — including a missing profile — is treated as no role at all.
 */
export type AppRole = "admin" | "dispatcher" | "driver" | "pending";

/** Roles allowed into the dispatch centre. */
export const DISPATCH_ROLES: readonly AppRole[] = ["admin", "dispatcher"];

/**
 * The role is only ever read from the public.users row loaded for the current
 * auth.uid(). It is never taken from the URL, from localStorage, or from
 * anything else the user can write.
 */
function normalizeRole(raw: unknown): AppRole | null {
  return raw === "admin" || raw === "dispatcher" || raw === "driver" ||
      raw === "pending"
    ? raw
    : null;
}

interface AuthContextType {
  user: SupabaseUser | null;
  profile: AppUser | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  profileStatus: ProfileStatus;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<any>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return ctx;
}

/**
 * Protected wrapper — shows children only to a signed-in account whose role is
 * allowed here. `allow` defaults to the dispatch roles, so every route already
 * wrapped in RequireAuth is gated by this one change and no route can be
 * forgotten.
 *
 * Deny by default: a driver, a pending account and an unrecognised role all get
 * NoDispatchAccess rather than the page.
 *
 * A profile that has not been read yet is a different thing from one that
 * grants nothing, and the two must not be conflated: while the read is in
 * flight the wrapper waits, and only a read that came back — with no row, an
 * error, or a role outside `allow` — denies access.
 *
 * This is route gating in the browser only. It stops a dispatch page from
 * rendering; it does not protect the data behind it. Every privileged operation
 * still has to be enforced in Supabase — RLS, SECURITY DEFINER RPCs and Edge
 * Functions.
 */
export function RequireAuth({
  children,
  fallback,
  allow = DISPATCH_ROLES,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  allow?: readonly AppRole[];
}) {
  const { isAuthenticated, isLoading, profile, profileStatus } = useAuthContext();

  if (isLoading || (isAuthenticated && (profileStatus === "idle" || profileStatus === "loading"))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground font-mono">MOVIDO</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  const role = normalizeRole(profile?.role);
  if (!role || !allow.includes(role)) {
    return <NoDispatchAccess role={role} />;
  }

  return <>{children}</>;
}

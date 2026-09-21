/**
 * AcceptInvitation — where an invited driver sets a password and activates
 * their account.
 *
 * The invitation link is `/accept-invitation?token=<raw token>`. For a new
 * account the link Supabase sends lands here with the session in the URL hash,
 * which supabase-js consumes on its own (detectSessionInUrl is on); for someone
 * who already has an account, they sign in first and arrive here with a session
 * already established.
 *
 * The token is held in component state only. It is never logged, never written
 * to localStorage or sessionStorage, and it is stripped from the address bar as
 * soon as it has been read, so it cannot leak through history or a Referer
 * header. It is not hashed here either: a hash sent from the browser would be
 * just as usable as the token, so hashing happens in the Edge Function.
 *
 * Nothing on this page is authoritative. The driver record, the organization
 * and the role all come from the invitation row, inside the accept-invitation
 * function and the RPC behind it. This page sends a token and a password.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Truck,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Smartphone,
} from "lucide-react";

type Phase =
  | "loading"
  | "no_token"
  | "needs_sign_in"
  | "form"
  | "submitting"
  | "success"
  | "error";

/** Supabase's own minimum is 6; 8 is the floor we ask for. */
const MIN_PASSWORD_LENGTH = 8;

/** Messages the user sees. Backend detail never reaches this map. */
const MESSAGES: Record<string, string> = {
  INVITATION_NOT_REDEEMABLE: "Invitation link is invalid or expired.",
  EMAIL_MISMATCH: "This invitation does not belong to this account.",
  DRIVER_ALREADY_BOUND: "This driver already has an account.",
  UNAUTHENTICATED: "Your session has expired. Please use the link again.",
  INVALID_REQUEST: "Invitation link is invalid or expired.",
  PASSWORD_FAILED: "Your password could not be set.",
  GENERIC: "Your invitation could not be completed.",
};

/** Reads `error` out of an Edge Function error response without trusting it. */
async function readFunctionError(err: unknown): Promise<string> {
  const ctx = (err as { context?: unknown }).context;
  if (ctx instanceof Response) {
    try {
      const parsed: unknown = await ctx.json();
      const code = (parsed as { error?: unknown }).error;
      if (typeof code === "string" && code in MESSAGES) return code;
    } catch {
      /* fall through to the generic message */
    }
  }
  return "GENERIC";
}

export default function AcceptInvitation() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // The raw token: memory only, never state that renders and never storage.
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    // Take the token out of the URL immediately, then rewrite the address bar
    // so it is not left in history or sent on as a referrer.
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      tokenRef.current = token;
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (!token) {
      setPhase("no_token");
      return;
    }

    // supabase-js picks the session out of the URL hash by itself; give it the
    // chance to finish, and listen in case it lands after this first check.
    const resolveSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session?.user?.email) {
        setEmail(data.session.user.email);
        setPhase("form");
      } else {
        setPhase("needs_sign_in");
      }
    };

    void resolveSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user?.email) {
        setEmail(session.user.email);
        setPhase((current) =>
          current === "needs_sign_in" || current === "loading"
            ? "form"
            : current
        );
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenRef.current;
    if (!token) {
      setPhase("no_token");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setMessage("The two passwords do not match.");
      return;
    }

    setMessage("");
    setPhase("submitting");

    // 1 — Set the password on the account the session already belongs to. No
    //     signUp: the account exists, and signing up would create a second one.
    const { error: pwErr } = await supabase.auth.updateUser({ password });
    if (pwErr) {
      setMessage(MESSAGES.PASSWORD_FAILED);
      setPhase("form");
      return;
    }

    // 2 — Redeem the invitation. The function derives the caller from the JWT
    //     and the driver from the invitation; neither is sent from here.
    const { error: fnErr } = await supabase.functions.invoke(
      "accept-invitation",
      { body: { token } },
    );

    if (fnErr) {
      const code = await readFunctionError(fnErr);
      setMessage(MESSAGES[code] ?? MESSAGES.GENERIC);
      setPhase("error");
      return;
    }

    // 3 — Confirm the account really is a driver now, reading only our own row.
    //     RLS (users_select_own) allows this and nothing wider.
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profile?.role !== "driver") {
        setMessage(MESSAGES.GENERIC);
        setPhase("error");
        return;
      }
    }

    tokenRef.current = null;
    setPhase("success");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Truck className="w-8 h-8 text-primary" />
        </div>

        {phase === "loading" && (
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-muted-foreground text-sm">Checking your invitation…</p>
          </div>
        )}

        {phase === "no_token" && (
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Invitation link is invalid</h2>
            <p className="text-muted-foreground text-sm">
              This link is missing its invitation code. Please open the link from
              your invitation email exactly as it was sent.
            </p>
          </div>
        )}

        {phase === "needs_sign_in" && (
          <div className="text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-bold">Sign in to continue</h2>
            <p className="text-muted-foreground text-sm">
              You already have a Movido account. Sign in with it, then open your
              invitation link again to finish setting up.
            </p>
            <Link href="/login">
              <Button className="w-full">Go to sign in</Button>
            </Link>
          </div>
        )}

        {(phase === "form" || phase === "submitting") && (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Set your password</h2>
              <p className="text-muted-foreground text-sm">
                Activating the account for <span className="font-medium">{email}</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={phase === "submitting"}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={phase === "submitting"}
                required
              />
            </div>

            {message && (
              <p className="text-destructive text-sm text-center">{message}</p>
            )}

            <Button type="submit" className="w-full" disabled={phase === "submitting"}>
              {phase === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Activating…
                </>
              ) : (
                "Activate my account"
              )}
            </Button>
          </form>
        )}

        {phase === "success" && (
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Your account is ready</h2>
            <Smartphone className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">
              Open the Movido Driver app on your phone and sign in with{" "}
              <span className="font-medium">{email}</span> and the password you
              just set. The dispatch centre is for office staff, so there is
              nothing more to do here.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-muted-foreground text-sm">{message}</p>
            <p className="text-muted-foreground text-xs">
              If this keeps happening, ask your office to send a new invitation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

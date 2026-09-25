/**
 * ResetPassword — where somebody who followed a recovery link sets a new
 * password.
 *
 * The recovery link Supabase sends lands here with the session in the URL hash,
 * which supabase-js consumes on its own (detectSessionInUrl is on). Nothing on
 * this page reads, stores or logs that hash, the access token, the refresh
 * token or the recovery code: the only thing it does with the session is call
 * updateUser, which acts on whatever session the client already holds.
 *
 * After a successful change the recovery session is ended, so the new password
 * has to be used to get back in. That keeps a recovery link from doubling as a
 * way to stay signed in, and it leaves role-based access control to the normal
 * sign-in path.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Loader2, AlertCircle, CheckCircle2, LogIn } from "lucide-react";

type Phase =
  | "loading"
  | "no_session"
  | "form"
  | "submitting"
  | "success";

/** Supabase's own minimum is 6; 8 is the floor we ask for. */
const MIN_PASSWORD_LENGTH = 8;

/** How long to wait for supabase-js to pick the session out of the hash. */
const SESSION_WAIT_MS = 8000;

export default function ResetPassword() {
  const { signOut } = useAuthContext();
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    const admit = () => {
      if (!active || settled.current) return;
      settled.current = true;
      setPhase("form");
    };

    // supabase-js consumes the recovery hash by itself; give it the chance to
    // finish, and listen in case the session lands after this first check.
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) admit();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) admit();
    });

    const timer = setTimeout(() => {
      if (!active || settled.current) return;
      settled.current = true;
      setPhase("no_session");
    }, SESSION_WAIT_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      // The reason is not surfaced: it can carry backend detail, and an expired
      // link and a rejected password read the same to the person either way.
      setMessage("Your password could not be changed. The link may have expired.");
      setPhase("form");
      return;
    }

    // End the recovery session so the new password is what gets the account
    // back in. A failure here must not block the success screen — the password
    // is already changed.
    try {
      await signOut();
    } catch {
      /* the password change stands regardless */
    }

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
            <p className="text-muted-foreground text-sm">Checking your link…</p>
          </div>
        )}

        {phase === "no_session" && (
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Recovery link is invalid</h2>
            <p className="text-muted-foreground text-sm">
              This link is missing its recovery code, or it has already been
              used. Request a new one from the sign-in page.
            </p>
            <Link href="/login">
              <Button variant="outline" className="w-full">Back to sign in</Button>
            </Link>
          </div>
        )}

        {(phase === "form" || phase === "submitting") && (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Set a new password</h2>
              <p className="text-muted-foreground text-sm">
                Choose a new password for your Movido account.
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
                className="bg-muted/30"
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
                className="bg-muted/30"
              />
            </div>

            {message && (
              <p className="text-destructive text-sm text-center">{message}</p>
            )}

            <Button type="submit" className="w-full" disabled={phase === "submitting"}>
              {phase === "submitting" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                "Save new password"
              )}
            </Button>
          </form>
        )}

        {phase === "success" && (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-8 h-8 text-primary mx-auto" />
            <h2 className="text-xl font-bold">Password changed</h2>
            <p className="text-muted-foreground text-sm">
              Your new password is saved. Sign in with it to get back into your
              account.
            </p>
            <Link href="/login">
              <Button className="w-full gap-2">
                <LogIn className="w-4 h-4" />
                Go to sign in
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

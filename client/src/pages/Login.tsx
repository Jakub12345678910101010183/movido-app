/**
 * Login Page
 * Supabase Auth — email/password sign-in and sign-up
 * Terminal Noir aesthetic matching the rest of the app
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, LogIn, UserPlus, AlertCircle, Loader2, KeyRound, MailCheck } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useLocation, useSearch } from "wouter";

export default function Login() {
  const { signInWithEmail, signUpWithEmail, requestPasswordReset } = useAuthContext();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const redirectTo = new URLSearchParams(search).get("redirect") || "/dashboard";
  const [mode, setMode] = useState<"login" | "register" | "forgot">(() =>
    new URLSearchParams(window.location.search).get("mode") === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showResetSent, setShowResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "forgot") {
        // The outcome is never reported differently for a known and an unknown
        // address: both end on the same screen, so this form cannot be used to
        // find out who has an account. A failure is swallowed for the same
        // reason, and nothing about the request is logged.
        try {
          await requestPasswordReset(email);
        } catch {
          /* deliberately indistinguishable from success */
        }
        setShowResetSent(true);
      } else if (mode === "login") {
        await signInWithEmail(email, password);
        setLocation(redirectTo);
      } else {
        await signUpWithEmail(email, password, name);
        setShowConfirmation(true);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (showResetSent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <MailCheck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Check your inbox</h2>
          {/* Deliberately says nothing about whether this address has an
              account. The wording is identical either way. */}
          <p className="text-muted-foreground text-sm">
            If an account exists for that address, a link to set a new password
            is on its way. The link can only be used once.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setShowResetSent(false);
              setMode("login");
              setError("");
            }}
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  if (showConfirmation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Check your email</h2>
          <p className="text-muted-foreground text-sm">
            We've sent a confirmation link to <span className="text-primary font-mono">{email}</span>.
            Click the link to activate your account.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setShowConfirmation(false);
              setMode("login");
            }}
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-card/30 border-r border-border flex-col justify-center items-center p-12">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <span className="text-2xl font-bold tracking-tight">MOVIDO</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight">
            Dispatch Center for{" "}
            <span className="text-primary">Modern Logistics</span>
          </h1>

          <p className="text-muted-foreground text-lg leading-relaxed">
            Plan jobs, dispatch drivers, follow them live on the map and
            collect proof of delivery — for your office and your drivers'
            phones.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { value: "14 days", label: "Free trial" },
              { value: "~15 s", label: "Driver position updates" },
              { value: "Photo + signature", label: "Proof of delivery" },
              { value: "0", label: "Apps to install" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-lg bg-muted/20 border border-border"
              >
                <div className="text-xl font-mono font-bold text-primary">
                  {stat.value}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xl font-bold tracking-tight">MOVIDO</span>
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-bold">
              {mode === "login"
                ? "Sign in"
                : mode === "forgot"
                ? "Reset your password"
                : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Enter your credentials to access the Dispatch Center"
                : mode === "forgot"
                ? "Enter the email address for your account and we will send a link to set a new password"
                : "Set up your Movido account"}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="bg-muted/30"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.co.uk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/30"
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {mode === "login" && (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => {
                        setMode("forgot");
                        setError("");
                        setPassword("");
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="bg-muted/30"
                />
              </div>
            )}

            <Button
              type="submit"
              className="w-full gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="w-4 h-4" />
              ) : mode === "forgot" ? (
                <KeyRound className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {mode === "login"
                ? "Sign In"
                : mode === "forgot"
                ? "Send reset link"
                : "Create Account"}
            </Button>
          </form>

          <div className="text-center space-y-2">
            <button
              type="button"
              className="block w-full text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "Don't have an account? Sign up"}
            </button>

            {mode === "forgot" && (
              <button
                type="button"
                className="block w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
              >
                Back to Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Login Page
 * Supabase Auth — email/password sign-in and sign-up
 * Terminal Noir aesthetic matching the rest of the app
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, LogIn, UserPlus, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { useAuthContext } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const { signInWithEmail, signUpWithEmail } = useAuthContext();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
        // Small delay to ensure session is persisted in storage before redirect
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 100);
        return;
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

  // Forgot Password screen
  if (showForgotPassword) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-primary" />
          </div>
          {resetSent ? (
            <>
              <h2 className="text-xl font-bold">Check your email</h2>
              <p className="text-muted-foreground text-sm">
                We've sent a password reset link to <span className="text-primary font-mono">{email}</span>.
                Click the link to reset your password.
              </p>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">Reset your password</h2>
              <p className="text-muted-foreground text-sm">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <form onSubmit={async (e) => {
                e.preventDefault();
                setIsLoading(true);
                setError("");
                try {
                  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/login`,
                  });
                  if (resetError) throw resetError;
                  setResetSent(true);
                } catch (err: any) {
                  setError(err.message || "Failed to send reset email");
                } finally {
                  setIsLoading(false);
                }
              }} className="space-y-4">
                <Input
                  type="email"
                  placeholder="dispatcher@movido.co.uk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-muted/30"
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Reset Link
                </Button>
              </form>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setShowForgotPassword(false);
              setResetSent(false);
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
            Professional fleet management with real-time tracking, AI route
            optimisation, and HGV-specific navigation. Built for dispatchers
            who demand precision.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { value: "99.9%", label: "Uptime" },
              { value: "< 2s", label: "Location Update" },
              { value: "15%", label: "Fuel Savings" },
              { value: "24/7", label: "Support" },
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
              {mode === "login" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Enter your credentials to access the Dispatch Center"
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
                  placeholder="John Doe"
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
                placeholder="dispatcher@movido.co.uk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
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

            <Button
              type="submit"
              className="w-full gap-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "login" ? (
                <LogIn className="w-4 h-4" />
              ) : (
                <UserPlus className="w-4 h-4" />
              )}
              {mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {mode === "login" && (
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { setShowForgotPassword(true); setError(""); }}
              >
                Forgot your password?
              </button>
            </div>
          )}

          <div className="text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
                setShowForgotPassword(false);
              }}
            >
              {mode === "login"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

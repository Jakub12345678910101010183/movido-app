/**
 * AuthCallback — Supabase email confirmation handler
 *
 * Supabase sends users here after they click the confirmation email link.
 * The URL contains either:
 *   - ?code=<pkce_code>   (PKCE flow — newer Supabase projects)
 *   - #access_token=...   (implicit flow — legacy, handled automatically)
 *
 * This page calls exchangeCodeForSession, then redirects to /dashboard.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Truck, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

type Status = "loading" | "success" | "error";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // 1 — PKCE flow: ?code=... in search params
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          setStatus("success");
          // Brief delay so user sees the success state
          setTimeout(() => setLocation("/dashboard"), 1500);
          return;
        }

        // 2 — Implicit flow: #access_token=... in hash
        // supabase-js detects this automatically on getSession()
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (session) {
          setStatus("success");
          setTimeout(() => setLocation("/dashboard"), 1500);
          return;
        }

        // No code and no session — invalid/expired link
        throw new Error("Confirmation link is invalid or has expired. Please register again.");
      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "Something went wrong.");
      }
    };

    handleCallback();
  }, [setLocation]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Truck className="w-8 h-8 text-primary" />
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <div>
              <h2 className="text-xl font-bold">Confirming your email…</h2>
              <p className="text-muted-foreground text-sm mt-2">Please wait a moment</p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <div>
              <h2 className="text-xl font-bold text-green-400">Email Confirmed!</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Welcome to Movido. Redirecting to your Dispatch Center…
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <AlertCircle className="w-10 h-10 text-destructive mx-auto" />
            <div>
              <h2 className="text-xl font-bold text-destructive">Confirmation Failed</h2>
              <p className="text-muted-foreground text-sm mt-2">{errorMsg}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/login">
                <Button className="w-full">Back to Sign In</Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                If the link has expired, simply register again — confirmation links are valid for 24 hours.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

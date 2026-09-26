/**
 * Shown instead of a dispatch page when the signed-in account may not use the
 * dispatch centre.
 *
 * This screen deliberately reads nothing: no jobs, no drivers, no organization.
 * It renders a message from the role it is handed and offers sign-out. Keep it
 * that way — it is the fallback for accounts that must not see dispatch data.
 *
 * The one action it offers is onboarding: a brand-new account that belongs to
 * no organisation can create its company through the create_organization RPC,
 * which makes it that organisation's admin. The database refuses the call for
 * any account that already belongs to an organisation or holds a role.
 */

import { useState, type FormEvent } from "react";
import { Truck, ShieldAlert, Smartphone, Clock, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import type { AppRole } from "@/contexts/AuthContext";

type Props = { role: AppRole | null };

const CONTENT: Record<"driver" | "pending" | "unknown", {
  icon: typeof Truck;
  title: string;
  body: string;
}> = {
  driver: {
    icon: Smartphone,
    title: "Driver account",
    body:
      "Your account is active as a driver. The dispatch centre is for office " +
      "staff — open the driver workspace to see your jobs, record each stop " +
      "and submit proof of delivery.",
  },
  pending: {
    icon: Clock,
    title: "Account pending",
    body:
      "Your account has been created but does not have any permissions yet. " +
      "An administrator at your company needs to activate it before you can " +
      "sign in to the dispatch centre.",
  },
  unknown: {
    icon: ShieldAlert,
    title: "No access",
    body:
      "We could not confirm what this account is allowed to do, so access to " +
      "the dispatch centre has been withheld. Sign out and try again, or " +
      "contact an administrator at your company.",
  },
};

function CreateOrganization() {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter your company name.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("create_organization", { p_name: trimmed });
    if (rpcError) {
      setSaving(false);
      setError(
        rpcError.message.includes("ALREADY_IN_ORGANIZATION")
          ? "This account already belongs to a company. Sign out and sign in again."
          : "We could not create your company. Please try again.",
      );
      return;
    }
    // The profile (role + organisation) is loaded once per session; a reload
    // picks up the new admin role and opens the dispatch centre.
    window.location.assign("/dashboard");
  };

  return (
    <form onSubmit={submit} className="text-left space-y-3 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-4 h-4 text-primary" />
        <p className="font-semibold text-sm">Setting up MOViDO for your company?</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Create your company to start a 14-day trial. You will become its administrator.
        If you were invited as a driver, open the link in your invitation email instead.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="org-name">Company name</Label>
        <Input
          id="org-name"
          value={name}
          maxLength={100}
          autoComplete="organization"
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Northampton Haulage Ltd"
        />
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Create company
      </Button>
    </form>
  );
}

export default function NoDispatchAccess({ role }: Props) {
  const { signOut, profile } = useAuthContext();
  const canOnboard = role === "pending" && !profile?.organization_id;
  const key = role === "driver" || role === "pending" ? role : "unknown";
  const { icon: Icon, title, body } = CONTENT[key];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Truck className="w-8 h-8 text-primary" />
        </div>

        <div className="space-y-3">
          <Icon className="w-8 h-8 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-muted-foreground text-sm">{body}</p>
        </div>

        {canOnboard && <CreateOrganization />}

        {role === "driver" && (
          <Button asChild className="w-full">
            <a href="/driver">Open driver workspace</a>
          </Button>
        )}

        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

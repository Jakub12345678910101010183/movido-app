/**
 * Shown instead of a dispatch page when the signed-in account may not use the
 * dispatch centre.
 *
 * This screen deliberately reads nothing: no jobs, no drivers, no organization.
 * It renders a message from the role it is handed and offers sign-out. Keep it
 * that way — it is the fallback for accounts that must not see dispatch data.
 */

import { Truck, ShieldAlert, Smartphone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      "staff — please use the Movido Driver app on your phone to see your jobs, " +
      "record checks and submit proof of delivery.",
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

export default function NoDispatchAccess({ role }: Props) {
  const { signOut } = useAuthContext();
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

        <Button variant="outline" className="w-full" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

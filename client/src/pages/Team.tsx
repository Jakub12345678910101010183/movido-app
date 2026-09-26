/**
 * Team — admins manage who has access to their organisation.
 *
 * The list comes from users RLS (own organisation only). Every change goes
 * through admin_* RPCs that re-check in the database that the caller is an
 * admin of the same organisation, never touch the caller's own role, protect
 * the organisation owner and keep at least one admin. Drivers are invited
 * from the Drivers page; this page adds office staff who already signed up.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, UserPlus, Users, ShieldCheck, Ban, UserMinus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import type { User } from "@/lib/database.types";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", dispatcher: "Dispatcher", driver: "Driver", disabled: "Disabled", pending: "Pending",
};

const ERRORS: Record<string, string> = {
  ADMIN_ONLY: "Only administrators can manage the team.",
  USER_NOT_FOUND: "That user is not part of your organisation.",
  CANNOT_CHANGE_SELF: "You cannot change your own access.",
  OWNER_PROTECTED: "The account that created the organisation cannot be changed.",
  LAST_ADMIN: "The organisation must keep at least one admin.",
  DRIVER_ACCOUNT: "Driver accounts can only be drivers. Invite office staff with their own login.",
  NOT_A_DRIVER_ACCOUNT: "This account has no driver record, so it cannot be a driver.",
  ACCOUNT_NOT_AVAILABLE: "No available account with that email. Ask them to sign up at movidologistics.uk first, then add them here.",
  INVALID_ROLE: "That role is not allowed.",
};

function explain(message: string): string {
  const key = Object.keys(ERRORS).find((k) => message.includes(k));
  return key ? ERRORS[key] : "The change could not be saved. Please try again.";
}

export default function Team() {
  const { profile } = useAuthContext();
  const isAdmin = profile?.role === "admin";
  const [members, setMembers] = useState<User[] | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"dispatcher" | "admin">("dispatcher");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: org }] = await Promise.all([
      supabase.from("users").select("*").order("role").order("email"),
      supabase.from("organizations").select("owner_id").maybeSingle(),
    ]);
    if (error) {
      toast.error("Could not load the team");
      setMembers([]);
      return;
    }
    setMembers(data ?? []);
    setOwnerId(org?.owner_id ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setRole = async (user: User, role: string) => {
    setBusyId(user.id);
    const { error } = await supabase.rpc("admin_set_user_role", { p_user: user.id, p_role: role });
    setBusyId(null);
    if (error) { toast.error(explain(error.message)); return; }
    toast.success(`${user.name || user.email} is now ${ROLE_LABEL[role] ?? role}`);
    await load();
  };

  const remove = async (user: User) => {
    setBusyId(user.id);
    const { error } = await supabase.rpc("admin_remove_user", { p_user: user.id });
    setBusyId(null);
    setConfirmRemove(null);
    if (error) { toast.error(explain(error.message)); return; }
    toast.success(`${user.name || user.email} was removed from the organisation`);
    await load();
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    const { error } = await supabase.rpc("admin_add_user", { p_email: email.trim(), p_role: newRole });
    setAdding(false);
    if (error) { toast.error(explain(error.message)); return; }
    toast.success(`${email.trim()} added as ${ROLE_LABEL[newRole]}`);
    setEmail("");
    await load();
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="w-6 h-6 text-primary" />Team</h1>
            <p className="text-sm text-muted-foreground mt-1">People with access to your organisation.</p>
          </div>
          <Button variant="outline" size="icon" aria-label="Refresh team" onClick={() => void load()}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {isAdmin && (
          <form onSubmit={add} className="card-terminal p-4 grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Add a colleague by email</Label>
              <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.co.uk" autoComplete="off" />
              <p className="text-xs text-muted-foreground">They must have signed up first. Drivers are invited from the Drivers page.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as "dispatcher" | "admin")}>
                <SelectTrigger aria-label="Role for new colleague"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispatcher">Dispatcher</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={adding || !email.trim()}>
              {adding ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}Add
            </Button>
          </form>
        )}

        {members === null ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="card-terminal overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th>
                  <th className="p-3">Last sign-in</th>{isAdmin && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const self = m.id === profile?.id;
                  const owner = m.id === ownerId;
                  const locked = !isAdmin || self || owner;
                  return (
                    <tr key={m.id} className="border-b border-border/50" data-testid={`member-${m.email}`}>
                      <td className="p-3">{m.name || "—"}{self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}{owner && <span className="ml-2 text-xs text-primary">owner</span>}</td>
                      <td className="p-3 font-mono text-xs">{m.email}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${m.role === "disabled" ? "border-red-500/40 text-red-400" : "border-border"}`}>
                          {m.role === "admin" && <ShieldCheck className="w-3 h-3" />}{ROLE_LABEL[m.role ?? ""] ?? m.role}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{m.last_signed_in ? new Date(m.last_signed_in).toLocaleString("en-GB") : "—"}</td>
                      {isAdmin && (
                        <td className="p-3">
                          {locked ? (
                            <p className="text-right text-xs text-muted-foreground">—</p>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {m.role !== "driver" && m.role !== "disabled" && (
                                <Select value={m.role ?? ""} onValueChange={(v) => void setRole(m, v)} disabled={busyId === m.id}>
                                  <SelectTrigger className="w-36 h-8" aria-label={`Role for ${m.email}`}><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="dispatcher">Dispatcher</SelectItem>
                                    <SelectItem value="admin">Admin</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                              {m.role === "disabled" ? (
                                <Button size="sm" variant="outline" disabled={busyId === m.id}
                                  onClick={() => void setRole(m, "dispatcher")}>Enable as dispatcher</Button>
                              ) : (
                                <Button size="sm" variant="outline" disabled={busyId === m.id} onClick={() => void setRole(m, "disabled")}>
                                  <Ban className="w-3 h-3 mr-1" />Disable
                                </Button>
                              )}
                              {m.role === "disabled" && (
                                <Button size="sm" variant="outline" disabled={busyId === m.id}
                                  onClick={() => void setRole(m, "driver")}>Enable as driver</Button>
                              )}
                              <Button size="sm" variant="outline" className="text-red-500" disabled={busyId === m.id}
                                aria-label={`Remove ${m.email}`} onClick={() => setConfirmRemove(m)}>
                                <UserMinus className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove {confirmRemove?.name || confirmRemove?.email}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            They lose access to this organisation immediately. Their jobs and history stay. You can add them back later.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmRemove && void remove(confirmRemove)}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

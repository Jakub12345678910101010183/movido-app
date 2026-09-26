/**
 * Settings Page - Terminal Noir Design with DashboardLayout
 * User preferences including distance units, map settings, notifications
 */

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Settings as SettingsIcon,
  Map,
  Bell,
  Globe,
  Moon,
  Sun,
  Save,
  Building,
  User,
  LogOut,
  Shield,
  Loader2,
  Brain, Fuel,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { AIRoutePlanner } from "@/components/AIRoutePlanner";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";

export default function Settings() {
  const { user, profile, signOut } = useAuthContext();
  const [, setLocation] = useLocation();
  const [profileName, setProfileName] = useState(profile?.name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [showAIPlanner, setShowAIPlanner] = useState(false);

  // Distance unit preference
  const [useMiles, setUseMiles] = useState(() => {
    const stored = localStorage.getItem('movido-distance-unit');
    return stored !== 'km';
  });

  const [showCAZ, setShowCAZ] = useState(() => {
    try { return localStorage.getItem('movido-show-caz') !== 'false'; } catch { return true; }
  });

  const [dieselPrice, setDieselPrice] = useState('1.85');

  const saveSettings = () => {
    try {
      localStorage.setItem('movido-distance-unit', useMiles ? 'miles' : 'km');
      localStorage.setItem('movido-show-caz', showCAZ.toString());
      toast.success('Display preferences saved on this device');
    } catch {
      toast.error('This browser does not allow saving preferences');
    }
  };

  useEffect(() => {
    async function loadDieselPrice() {
      const { data } = await supabase
        .from('app_settings')
        .select('value, organization_id')
        .eq('key', 'diesel_price_per_litre');
      if (!data || data.length === 0) return;
      // Prefer the organisation's own value over the platform default.
      const own = data.find((row) => row.organization_id !== null) ?? data[0];
      setDieselPrice(own.value);
    }
    loadDieselPrice();
  }, []);

  const saveDieselPrice = async () => {
    const organizationId = profile?.organization_id;
    const price = Number(dieselPrice);
    if (!organizationId) {
      toast.error('Your account is not linked to an organisation');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Enter a valid diesel price');
      return;
    }
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        {
          organization_id: organizationId,
          key: 'diesel_price_per_litre',
          value: String(price),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,key' },
      );
    if (error) {
      toast.error(`Could not save diesel price: ${error.message}`);
      return;
    }
    toast.success(`Diesel price updated to £${price.toFixed(2)}/L`);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your Movido preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* User Profile (Supabase) */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Your Account</h2>
                <p className="text-xs text-muted-foreground">Your sign-in details</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label>Email</Label>
                <Input className="mt-1.5 bg-muted/30" value={user?.email || ""} disabled />
              </div>
              <div>
                <Label>Full Name</Label>
                <Input className="mt-1.5 bg-muted/30" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your name" />
              </div>
              <div>
                <Label>Role</Label>
                <Input className="mt-1.5 bg-muted/30" value={profile?.role || "dispatcher"} disabled />
              </div>
              <div>
                <Label>User ID</Label>
                <Input className="mt-1.5 bg-muted/30 font-mono text-xs" value={user?.id?.slice(0, 16) + "..." || ""} disabled />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={profileSaving}
                onClick={async () => {
                  if (!user) return;
                  setProfileSaving(true);
                  const { error } = await supabase
                    .from("users")
                    .update({ name: profileName.trim() || null })
                    .eq("id", user.id);
                  setProfileSaving(false);
                  if (error) toast.error(`Failed to update profile: ${error.message}`);
                  else toast.success("Profile updated");
                }}
              >
                {profileSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Update Profile
              </Button>
              <Button
                variant="outline"
                className="text-red-500 hover:text-red-400 hover:border-red-500/50"
                onClick={async () => {
                  await signOut();
                  setLocation("/login");
                }}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </section>

          {/* Company Information */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Company Information</h2>
                <p className="text-xs text-muted-foreground">Your organization details</p>
              </div>
            </div>

            <CompanyDetails canEdit={profile?.role === "admin"} />
          </section>

          {/* Units & Localization */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Units & Localization</h2>
                <p className="text-xs text-muted-foreground">Regional preferences</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Distance Unit</p>
                  <p className="text-sm text-muted-foreground">Choose between miles and kilometers</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${useMiles ? 'text-primary font-medium' : 'text-muted-foreground'}`}>Miles</span>
                  <Switch
                    aria-label="Use kilometres"
                    checked={!useMiles}
                    onCheckedChange={(checked) => setUseMiles(!checked)}
                  />
                  <span className={`text-sm ${!useMiles ? 'text-primary font-medium' : 'text-muted-foreground'}`}>KM</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Currency</p>
                  <p className="text-sm text-muted-foreground">Financial display currency</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-primary text-lg">£ GBP</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Timezone</p>
                  <p className="text-sm text-muted-foreground">System timezone</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-muted-foreground">Europe/London (UK time)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Map */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Map className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Map</h2>
                <p className="text-xs text-muted-foreground">Dispatch map display</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium" id="caz-label">Clean Air Zones</p>
                  <p className="text-sm text-muted-foreground">Mark UK charging zones on the dispatch map</p>
                </div>
                <Switch checked={showCAZ} onCheckedChange={setShowCAZ} aria-labelledby="caz-label" />
              </div>
              <p className="text-sm text-muted-foreground">
                Routes are always calculated for trucks with TomTom, using the height and weight entered in the route planner.
              </p>
            </div>
          </section>

          {/* Fuel Prices */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Fuel className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="font-semibold">Fuel Price</h2>
                <p className="text-xs text-muted-foreground">Used for route cost estimates</p>
              </div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="diesel-price">Diesel price per litre (£)</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="diesel-price"
                  type="number"
                  step="0.01"
                  min="0.50"
                  max="5.00"
                  value={dieselPrice}
                  onChange={(e) => setDieselPrice(e.target.value)}
                  className="w-32 font-mono"
                />
                <span className="text-sm text-muted-foreground">
                  HGV estimate £{(parseFloat(dieselPrice || '1.85') * 0.57).toFixed(2)}/mile
                </span>
              </div>
              <Button variant="outline" onClick={saveDieselPrice}>Save fuel price</Button>
            </div>
          </section>

          {/* Route planning */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Route Planner</h2>
                <p className="text-xs text-muted-foreground">Stop sequencing with live-traffic truck routing</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Add stops and MOViDO orders them for the shortest drive, then calculates the truck route with TomTom using live traffic and your vehicle's height and weight.
            </p>
            <Button variant="outline" onClick={() => setShowAIPlanner(true)}>
              <Brain className="w-4 h-4 mr-2" />
              Open route planner
            </Button>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveSettings} className="glow-cyan-sm">
              <Save className="w-4 h-4 mr-2" />
              Save display preferences
            </Button>
          </div>
        </div>

        <AIRoutePlanner open={showAIPlanner} onClose={() => setShowAIPlanner(false)} />
      </div>
    </DashboardLayout>
  );
}

type CompanyForm = { name: string; email: string; phone: string; address: string };

function CompanyDetails({ canEdit }: { canEdit: boolean }) {
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, email, phone, address, plan, plan_status, trial_ends_at")
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setLoadError(true);
        return;
      }
      setOrgId(data.id);
      setPlan(
        `${data.plan} · ${data.plan_status}` +
          (data.plan_status === "trial" && data.trial_ends_at
            ? ` (ends ${new Date(data.trial_ends_at).toLocaleDateString("en-GB")})`
            : ""),
      );
      setForm({
        name: data.name ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        address: data.address ?? "",
      });
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loadError) {
    return <p className="text-sm text-muted-foreground">Company details could not be loaded.</p>;
  }
  if (!form) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  const set = (key: keyof CompanyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    if (!orgId) return;
    if (form.name.trim().length < 2) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      })
      .eq("id", orgId);
    setSaving(false);
    if (error) toast.error(`Could not save company details: ${error.message}`);
    else toast.success("Company details saved");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="org-name">Company Name</Label>
          <Input id="org-name" className="mt-1.5 bg-muted/30" value={form.name} onChange={set("name")} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="org-email">Contact Email</Label>
          <Input id="org-email" type="email" className="mt-1.5 bg-muted/30" value={form.email} onChange={set("email")} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="org-phone">Phone</Label>
          <Input id="org-phone" className="mt-1.5 bg-muted/30" value={form.phone} onChange={set("phone")} disabled={!canEdit} />
        </div>
        <div>
          <Label htmlFor="org-address">Address</Label>
          <Input id="org-address" className="mt-1.5 bg-muted/30" value={form.address} onChange={set("address")} disabled={!canEdit} />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          <span className="capitalize">Plan: {plan}</span>
          {canEdit && <> · <Link href="/pricing" className="text-primary hover:underline">View plans and subscribe</Link></>}
        </p>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Company
          </Button>
        )}
      </div>
    </div>
  );
}

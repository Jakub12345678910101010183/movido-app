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
import { useLocation } from "wouter";

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

  // Other settings
  const [showLowBridges, setShowLowBridges] = useState(() => {
    return localStorage.getItem('movido-show-bridges') !== 'false';
  });

  const [showCAZ, setShowCAZ] = useState(() => {
    return localStorage.getItem('movido-show-caz') !== 'false';
  });

  const [notifications, setNotifications] = useState(() => {
    return localStorage.getItem('movido-notifications') !== 'false';
  });

  const [darkMode, setDarkMode] = useState(true);
  const [dieselPrice, setDieselPrice] = useState('1.85');

  const saveSettings = () => {
    localStorage.setItem('movido-distance-unit', useMiles ? 'miles' : 'km');
    localStorage.setItem('movido-show-bridges', showLowBridges.toString());
    localStorage.setItem('movido-show-caz', showCAZ.toString());
    localStorage.setItem('movido-notifications', notifications.toString());
    toast.success('Settings saved successfully');
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
                <p className="text-xs text-muted-foreground">Supabase authentication</p>
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
                  <span className="font-mono text-muted-foreground">Europe/London (GMT)</span>
                </div>
              </div>
            </div>
          </section>

          {/* Map & HGV Settings */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Map className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Map & HGV Layers</h2>
                <p className="text-xs text-muted-foreground">TomTom integration settings</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Low Bridge Warnings</p>
                  <p className="text-sm text-muted-foreground">Show UK low bridge database overlay</p>
                </div>
                <Switch
                  checked={showLowBridges}
                  onCheckedChange={setShowLowBridges}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Clean Air Zones (CAZ/ULEZ)</p>
                  <p className="text-sm text-muted-foreground">Display UK Clean Air Zone boundaries</p>
                </div>
                <Switch
                  checked={showCAZ}
                  onCheckedChange={setShowCAZ}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">HGV-Optimized Routes</p>
                  <p className="text-sm text-muted-foreground">Avoid unsuitable roads for heavy vehicles</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="p-4 rounded-lg bg-primary/5 border border-primary/30">
                <p className="text-sm text-muted-foreground">
                  <strong className="text-primary">Satellite View:</strong> Use the three-click navigation in the Dashboard map controls to toggle satellite imagery.
                </p>
              </div>
            </div>
          </section>

          {/* Notifications */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Notifications</h2>
                <p className="text-xs text-muted-foreground">Alert preferences</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Safety Alerts</p>
                  <p className="text-sm text-muted-foreground">Low bridges, weight limits, CAZ entries</p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Delivery Updates</p>
                  <p className="text-sm text-muted-foreground">POD confirmations, ETA changes</p>
                </div>
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Maintenance Reminders</p>
                  <p className="text-sm text-muted-foreground">Service due, MOT expiry alerts</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </section>

          {/* Appearance */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Moon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold">Appearance</h2>
                <p className="text-xs text-muted-foreground">Interface theme</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
                <div>
                  <p className="font-medium">Dark Mode</p>
                  <p className="text-sm text-muted-foreground">Bloomberg-inspired dark interface</p>
                </div>
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4 text-muted-foreground" />
                  <Switch
                    checked={darkMode}
                    onCheckedChange={setDarkMode}
                    disabled
                  />
                  <Moon className="w-4 h-4 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Dark mode is optimized for professional dispatch operations and cannot be disabled.
              </p>
            </div>
          </section>

          {/* Fuel Prices */}
          <section className="card-terminal p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <Fuel className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Fuel Prices</h2>
                <p className="text-sm text-gray-500">Update diesel price for route cost calculations</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Diesel Price per Litre (£)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0.50"
                    max="5.00"
                    value={dieselPrice}
                    onChange={(e) => setDieselPrice(e.target.value)}
                    className="w-32 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-sm text-gray-500">
                    per litre · HGV est. £{(parseFloat(dieselPrice || '1.85') * 0.57).toFixed(2)}/mile
                  </span>
                </div>
                <button
                  onClick={saveDieselPrice}
                  className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 transition-colors font-medium"
                >
                  Save Fuel Price
                </button>
              </div>
            </div>
          </section>
          {/* AI Route Planning */}
          <section className="card-terminal p-6 border border-cyan-500/30 bg-cyan-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-cyan-500" />
              </div>
              <div>
                <h2 className="font-semibold text-cyan-400">AI Route Planning</h2>
                <p className="text-xs text-muted-foreground">Intelligent route optimization and sequencing</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6">
              Use our AI-powered route planner to automatically optimize stop sequencing based on traffic conditions, HGV restrictions, and delivery priorities. Movido AI intelligently sequences your jobs to minimize travel time and cost.
            </p>

            <Button onClick={() => setShowAIPlanner(true)} className="glow-cyan-sm">
              <Brain className="w-4 h-4 mr-2" />
              Plan New AI Route
            </Button>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveSettings} className="glow-cyan-sm">
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>

        <AIRoutePlanner open={showAIPlanner} onClose={() => setShowAIPlanner(false)} onSaveJob={() => {}} />
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
        <p className="text-xs text-muted-foreground capitalize">Plan: {plan}</p>
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

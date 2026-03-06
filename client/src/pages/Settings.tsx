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
} from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useLocation } from "wouter";

export default function Settings() {
  const { user, profile, signOut } = useAuthContext();
  const [, setLocation] = useLocation();
  const [profileName, setProfileName] = useState(profile?.full_name || "");
  const [profileSaving, setProfileSaving] = useState(false);

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

  const saveSettings = () => {
    localStorage.setItem('movido-distance-unit', useMiles ? 'miles' : 'km');
    localStorage.setItem('movido-show-bridges', showLowBridges.toString());
    localStorage.setItem('movido-show-caz', showCAZ.toString());
    localStorage.setItem('movido-notifications', notifications.toString());
    toast.success('Settings saved successfully');
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
                  try {
                    await supabase.from("users").update({ full_name: profileName }).eq("id", user.id);
                    toast.success("Profile updated");
                  } catch { toast.error("Failed to update"); }
                  finally { setProfileSaving(false); }
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Company Name</Label>
                <Input className="mt-1.5 bg-muted/30" defaultValue="Movido Logistics Ltd" />
              </div>
              <div>
                <Label>Contact Email</Label>
                <Input className="mt-1.5 bg-muted/30" defaultValue="dispatch@movido.com" />
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1.5 bg-muted/30" defaultValue="+44 800 123 4567" />
              </div>
              <div>
                <Label>Address</Label>
                <Input className="mt-1.5 bg-muted/30" defaultValue="Northampton, United Kingdom" />
              </div>
            </div>
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

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={saveSettings} className="glow-cyan-sm">
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/**
 * DashboardLayout - Main layout with sidebar navigation
 * Bloomberg/Fintech style with icon-based navigation
 */

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
import { useAuthContext } from "@/contexts/AuthContext";
import { AIDispatcher } from "@/components/AIDispatcher";
import { AIRoutePlanner } from "@/components/AIRoutePlanner";
import PlanBanner from "@/components/PlanBanner";
import {
  LayoutDashboard,
  Briefcase,
  Truck,
  Users,
  Route,
  MessageSquare,
  Wrench,
  Camera,
  AlertTriangle,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Bell,
  Search,
  Fuel,
  ShieldAlert,
  ScanLine,
  ClipboardList,
  Sparkles,
  Menu,
  UserCog,
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

function initials(text: string): string {
  const parts = text.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Briefcase, label: "Jobs", path: "/jobs" },
  { icon: Truck, label: "Fleet", path: "/fleet" },
  { icon: Users, label: "Drivers", path: "/drivers" },
  { icon: Route, label: "Routes", path: "/routes" },
  { icon: MessageSquare, label: "Messenger", path: "/messenger" },
  { icon: Wrench, label: "Maintenance", path: "/maintenance" },
  { icon: Camera, label: "POD", path: "/pod" },
  { icon: ClipboardList, label: "WTD Hours", path: "/wtd" },
  { icon: ShieldAlert, label: "Incidents", path: "/incidents" },
  { icon: Fuel, label: "Fuel", path: "/fuel-reports" },
  { icon: ScanLine, label: "Doc Scanner", path: "/document-scanner" },
  { icon: AlertTriangle, label: "Alerts", path: "/alerts" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: FileText, label: "Reports", path: "/reports" },
  { icon: UserCog, label: "Team", path: "/team" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  // Below md the sidebar is an off-canvas drawer.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setMobileOpen(false), [location]);
  const { profile, signOut } = useAuthContext();
  // No fabricated counters: badges only render when a real count is wired in.
  const alertCount = 0;
  const [aiOpen, setAiOpen] = useState(false);
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(0);
  const [pulse, setPulse] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [, navigate] = useLocation();
  const formatClock = () =>
    new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", timeZoneName: "short" });
  const [currentTime, setCurrentTime] = useState(formatClock);

  useEffect(() => {
    const tick = setInterval(() => setCurrentTime(formatClock()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Stop pulsing after user opens the panel once
  useEffect(() => {
    if (aiOpen) setPulse(false);
  }, [aiOpen]);

  // Realtime toast notifications for all dispatch events
  useRealtimeNotifications(true);

  return (
    <div className="min-h-screen bg-terminal flex">
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" aria-hidden="true" onClick={() => setMobileOpen(false)} />
      )}
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? "md:w-16" : "md:w-56"
        } w-64 fixed inset-y-0 left-0 z-40 md:static md:z-auto ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 border-r border-border bg-card md:bg-card/50 flex flex-col transition-all duration-300`}
      >
        {/* Logo */}
        <div className="h-14 border-b border-border flex items-center justify-between px-3">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Truck className="w-4 h-4 text-primary" />
              </div>
              {!collapsed && (
                <span className="font-bold tracking-tight text-sm">MOVIDO</span>
              )}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hidden md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              location === item.path ||
              (item.path !== "/dashboard" && location.startsWith(item.path));
            const Icon = item.icon;

            const linkContent = (
              <Link href={item.path}>
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  {!collapsed && (
                    <span className="text-sm font-medium">{item.label}</span>
                  )}
                  {!collapsed && item.label === "Alerts" && alertCount > 0 && (
                    <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30">
                      {alertCount}
                    </span>
                  )}
                </div>
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {item.label}
                    {item.label === "Alerts" && alertCount > 0 && (
                      <span className="ml-2 text-red-500">({alertCount})</span>
                    )}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.path}>{linkContent}</div>;
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-border p-3">
          {collapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="w-full" aria-label="Sign out" onClick={() => signOut()}>
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">{initials(profile?.name ?? profile?.email ?? "")}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.name || profile?.email || "Signed in"}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">{profile?.role ?? ""}</p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => signOut()}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-14 border-b border-border bg-card/50 flex items-center justify-between gap-2 px-3 md:px-4">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                aria-label="Search jobs"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchText.trim()) {
                    navigate(`/jobs?q=${encodeURIComponent(searchText.trim())}`);
                  }
                }}
                placeholder="Search jobs by reference, customer, address..."
                className="w-64 lg:w-80 h-9 pl-9 pr-4 rounded-lg bg-muted/30 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
              {currentTime}
            </span>

            {/* ── AI PLANER BUTTON ── */}
            <button
              onClick={() => setAiOpen(true)}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                border: "none",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.3px",
                cursor: "pointer",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
                animation: pulse ? "ai-btn-glow 2.4s ease-in-out infinite" : "none",
                boxShadow: pulse
                  ? "0 0 18px rgba(99,102,241,0.55), 0 2px 10px rgba(99,102,241,0.3)"
                  : "0 2px 10px rgba(99,102,241,0.3)",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.transform = "translateY(-1px) scale(1.02)";
                el.style.boxShadow = "0 6px 30px rgba(99,102,241,0.65)";
                el.style.background = "linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)";
                el.style.animation = "none";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.transform = "translateY(0) scale(1)";
                el.style.boxShadow = pulse
                  ? "0 0 18px rgba(99,102,241,0.55), 0 2px 10px rgba(99,102,241,0.3)"
                  : "0 2px 10px rgba(99,102,241,0.3)";
                el.style.background = "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)";
                el.style.animation = pulse ? "ai-btn-glow 2.4s ease-in-out infinite" : "none";
              }}
            >
              <Sparkles className="w-3.5 h-3.5 text-white" style={{ flexShrink: 0 }} />
              <span className="hidden sm:inline">Assistant</span>
              {aiSuggestions > 0 && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 4px",
                    background: "rgba(255,255,255,0.25)",
                    borderRadius: "9px",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: "#fff",
                    lineHeight: 1,
                  }}
                >
                  {aiSuggestions}
                </span>
              )}
            </button>

            {/* Bell */}
            <Button variant="ghost" size="icon" className="relative" aria-label={alertCount > 0 ? `Alerts (${alertCount})` : "Alerts"} onClick={() => navigate("/alerts")}>
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </Button>
          </div>
        </header>

        <PlanBanner />

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* AI Dispatcher Panel */}
      <AIDispatcher
        open={aiOpen}
        onClose={() => {
          setAiOpen(false);
          setAiSuggestions(0);
        }}
        onPlanRoute={() => {
          setAiOpen(false);
          setAiSuggestions(0);
          setRoutePlannerOpen(true);
        }}
      />

      {/* AI Route Planner — full screen, no overlap */}
      <AIRoutePlanner
        open={routePlannerOpen}
        onClose={() => setRoutePlannerOpen(false)}
        onSaveJob={() => setRoutePlannerOpen(false)}
      />

      {/* Keyframe injection */}
      <style>{`
        @keyframes ai-btn-glow {
          0%, 100% {
            box-shadow: 0 0 14px rgba(99,102,241,0.45),
                        0 2px 10px rgba(99,102,241,0.25);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 28px rgba(139,92,246,0.75),
                        0 4px 20px rgba(99,102,241,0.5);
            transform: scale(1.025);
          }
        }
      `}</style>
    </div>
  );
}

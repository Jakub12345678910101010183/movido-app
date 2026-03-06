/**
 * DashboardLayout - Main layout with sidebar navigation
 * Bloomberg/Fintech style with icon-based navigation
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeNotifications } from "@/hooks/useRealtimeNotifications";
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
} from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
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
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [alertCount] = useState(3);

  // Realtime toast notifications for all dispatch events
  useRealtimeNotifications(true);

  return (
    <div className="min-h-screen bg-terminal flex">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? "w-16" : "w-56"
        } border-r border-border bg-card/50 flex flex-col transition-all duration-300`}
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
            className="h-7 w-7"
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
            const isActive = location === item.path || 
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
                <Button variant="ghost" size="icon" className="w-full">
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sign Out</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">JD</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">John Doe</p>
                <p className="text-xs text-muted-foreground truncate">Dispatcher</p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search jobs, vehicles, drivers..."
                className="w-80 h-9 pl-9 pr-4 rounded-lg bg-muted/30 border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono">
              {new Date().toLocaleTimeString("en-GB")} GMT
            </span>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-4 h-4" />
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold flex items-center justify-center">
                  {alertCount}
                </span>
              )}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

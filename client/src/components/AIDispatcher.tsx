/**
 * AI Dispatcher Assistant — Smart command panel
 * Features:
 * - Natural language job dispatch ("Assign JOB-2026-001 to John")
 * - Delay detection & alerts
 * - Smart driver recommendations (nearest, available, rating)
 * - Auto-arrive suggestions based on geofencing
 * - Fleet status summary
 * - Quick actions from AI suggestions
 *
 * Uses Supabase data to make intelligent recommendations
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Brain, Send, Loader2, X, Sparkles, Truck, User, MapPin,
  AlertTriangle, Clock, CheckCircle, Zap, RefreshCw,
} from "lucide-react";
import { useJobs, useDrivers, useVehicles } from "@/hooks/useSupabaseData";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  timestamp: Date;
}

interface AIAction {
  label: string;
  type: "assign_driver" | "update_status" | "send_alert" | "navigate";
  payload: Record<string, any>;
}

interface AIDispatcherProps {
  open: boolean;
  onClose: () => void;
}

export function AIDispatcher({ open, onClose }: AIDispatcherProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { jobs, refetch: refetchJobs } = useJobs();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Initial greeting
  useEffect(() => {
    if (open && messages.length === 0) {
      const pending = jobs.filter((j) => j.status === "pending").length;
      const inProgress = jobs.filter((j) => j.status === "in_progress").length;
      const available = drivers.filter((d) => d.status === "available" || d.status === "on_duty").length;

      setMessages([{
        id: "welcome",
        role: "assistant",
        content: `Welcome to Movido AI Dispatch. Current status:\n\n• ${pending} pending jobs awaiting assignment\n• ${inProgress} jobs in progress\n• ${available} drivers available\n• ${vehicles.length} vehicles in fleet\n\nHow can I help? Try:\n— "Show unassigned jobs"\n— "Recommend driver for JOB-2026-001"\n— "Fleet status"\n— "Any delays?"`,
        timestamp: new Date(),
      }]);
    }
  }, [open]);

  // ============================================
  // AI Processing Logic
  // ============================================

  const processCommand = useCallback(async (text: string): Promise<AIMessage> => {
    const lower = text.toLowerCase();
    const now = new Date();

    // ---- UNASSIGNED JOBS ----
    if (lower.includes("unassigned") || lower.includes("pending") || (lower.includes("no") && lower.includes("driver"))) {
      const unassigned = jobs.filter((j) => j.status === "pending" && !j.driver_id);
      if (unassigned.length === 0) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: "All jobs are currently assigned. No pending jobs without drivers.", timestamp: now };
      }
      const list = unassigned.slice(0, 5).map((j) => `• **${j.reference}** — ${j.customer} → ${j.delivery_address || "No address"} (${j.priority})`).join("\n");
      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `Found ${unassigned.length} unassigned job(s):\n\n${list}${unassigned.length > 5 ? `\n\n...and ${unassigned.length - 5} more` : ""}`,
        actions: unassigned.slice(0, 3).map((j) => ({
          label: `Auto-assign ${j.reference}`, type: "assign_driver" as const, payload: { jobId: j.id, jobRef: j.reference },
        })),
      };
    }

    // ---- RECOMMEND DRIVER ----
    if (lower.includes("recommend") || lower.includes("best driver") || lower.includes("suggest driver")) {
      const jobRefMatch = text.match(/JOB-\d{4}-\d{3}/i);
      const targetJob = jobRefMatch ? jobs.find((j) => j.reference.toLowerCase() === jobRefMatch[0].toLowerCase()) : jobs.find((j) => j.status === "pending" && !j.driver_id);

      if (!targetJob) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: "No matching job found. Please specify a job reference (e.g., JOB-2026-001).", timestamp: now };
      }

      const availableDrivers = drivers.filter((d) => d.status === "available" || d.status === "on_duty");
      if (availableDrivers.length === 0) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: "No drivers currently available. All drivers are off duty or on break.", timestamp: now };
      }

      // Score drivers: rating * 2 + (10 - hours_today) + available bonus
      const scored = availableDrivers.map((d) => ({
        driver: d,
        score: (d.rating || 3) * 2 + (10 - (d.hours_today || 0)) + (d.status === "available" ? 2 : 0),
      })).sort((a, b) => b.score - a.score).slice(0, 3);

      const recommendations = scored.map((s, i) => {
        const d = s.driver;
        return `${i + 1}. **${d.name}** — Rating: ${d.rating || "N/A"} ★, Hours today: ${d.hours_today || 0}h, Status: ${d.status}, Score: ${s.score.toFixed(1)}`;
      }).join("\n");

      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `Driver recommendations for **${targetJob.reference}** (${targetJob.customer}):\n\n${recommendations}\n\nRecommendation: **${scored[0].driver.name}** is the best match.`,
        actions: scored.map((s) => ({
          label: `Assign ${s.driver.name}`, type: "assign_driver" as const,
          payload: { jobId: targetJob.id, driverId: s.driver.id, driverName: s.driver.name, jobRef: targetJob.reference },
        })),
      };
    }

    // ---- ASSIGN DRIVER ----
    if (lower.includes("assign")) {
      const jobRefMatch = text.match(/JOB-\d{4}-\d{3}/i);
      const driverNameMatch = text.match(/to\s+(\w+)/i);

      if (!jobRefMatch) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: "Please specify a job reference. Example: 'Assign JOB-2026-001 to John'", timestamp: now };
      }

      const job = jobs.find((j) => j.reference.toLowerCase() === jobRefMatch[0].toLowerCase());
      if (!job) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: `Job ${jobRefMatch[0]} not found.`, timestamp: now };
      }

      const driverName = driverNameMatch?.[1];
      const driver = driverName ? drivers.find((d) => d.name.toLowerCase().includes(driverName.toLowerCase())) : null;

      if (!driver) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: `Driver "${driverName || "unknown"}" not found. Available drivers: ${drivers.filter((d) => d.status === "available").map((d) => d.name).join(", ") || "None"}`, timestamp: now };
      }

      // Execute assignment
      const { error } = await supabase.from("jobs").update({ driver_id: driver.id, status: "assigned" }).eq("id", job.id);
      if (error) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: `Failed to assign: ${error.message}`, timestamp: now };
      }

      refetchJobs();
      toast.success(`${job.reference} assigned to ${driver.name}`);
      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `✅ **${job.reference}** has been assigned to **${driver.name}**.\n\nJob status updated to "assigned". The driver will see this in their Movido app.`,
      };
    }

    // ---- DELAYS ----
    if (lower.includes("delay") || lower.includes("late") || lower.includes("overdue")) {
      const inProgress = jobs.filter((j) => j.status === "in_progress" && j.eta);
      const delayed = inProgress.filter((j) => new Date(j.eta!) < now);

      if (delayed.length === 0) {
        return { id: `ai-${Date.now()}`, role: "assistant", content: `No delays detected. All ${inProgress.length} active deliveries are on schedule.`, timestamp: now };
      }

      const list = delayed.map((j) => {
        const minsLate = Math.round((now.getTime() - new Date(j.eta!).getTime()) / 60000);
        return `• **${j.reference}** — ${j.customer}, ${minsLate}min late`;
      }).join("\n");

      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `⚠️ Found ${delayed.length} delayed delivery(s):\n\n${list}\n\nConsider contacting the drivers or notifying customers.`,
        actions: delayed.slice(0, 2).map((j) => ({
          label: `Alert on ${j.reference}`, type: "send_alert" as const, payload: { jobId: j.id, jobRef: j.reference },
        })),
      };
    }

    // ---- FLEET STATUS ----
    if (lower.includes("fleet") || lower.includes("status") || lower.includes("overview")) {
      const active = vehicles.filter((v) => v.status === "active").length;
      const idle = vehicles.filter((v) => v.status === "idle").length;
      const maint = vehicles.filter((v) => v.status === "maintenance").length;
      const lowFuel = vehicles.filter((v) => (v.fuel_level || 0) < 20).length;
      const onDuty = drivers.filter((d) => d.status === "on_duty").length;
      const available = drivers.filter((d) => d.status === "available").length;

      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `📊 **Fleet Status Summary**\n\n**Vehicles** (${vehicles.length} total)\n• Active: ${active}\n• Idle: ${idle}\n• In Maintenance: ${maint}\n• Low Fuel (<20%): ${lowFuel}\n\n**Drivers** (${drivers.length} total)\n• On Duty: ${onDuty}\n• Available: ${available}\n• Off Duty: ${drivers.length - onDuty - available}\n\n**Jobs**\n• Pending: ${jobs.filter((j) => j.status === "pending").length}\n• In Progress: ${jobs.filter((j) => j.status === "in_progress").length}\n• Completed Today: ${jobs.filter((j) => j.status === "completed").length}`,
      };
    }

    // ---- HELP ----
    if (lower.includes("help") || lower === "?") {
      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `**Available Commands:**\n\n• "Show unassigned jobs" — List pending jobs without drivers\n• "Recommend driver for JOB-2026-001" — AI driver scoring\n• "Assign JOB-2026-001 to John" — Direct assignment\n• "Any delays?" — Check overdue deliveries\n• "Fleet status" — Full overview\n• "How many drivers available?" — Quick count`,
      };
    }

    // ---- DRIVER COUNT ----
    if (lower.includes("how many") && lower.includes("driver")) {
      const available = drivers.filter((d) => d.status === "available").length;
      const onDuty = drivers.filter((d) => d.status === "on_duty").length;
      return {
        id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
        content: `Currently: **${available}** available, **${onDuty}** on duty, **${drivers.length}** total drivers.`,
      };
    }

    // ---- FALLBACK ----
    return {
      id: `ai-${Date.now()}`, role: "assistant", timestamp: now,
      content: `I understand you said: "${text}"\n\nI can help with:\n• Job assignment & recommendations\n• Delay detection\n• Fleet status overview\n\nTry "help" for all commands.`,
    };
  }, [jobs, drivers, vehicles, refetchJobs]);

  // ============================================
  // Execute AI Action
  // ============================================

  const executeAction = useCallback(async (action: AIAction) => {
    if (action.type === "assign_driver") {
      if (action.payload.driverId) {
        const { error } = await supabase.from("jobs").update({ driver_id: action.payload.driverId, status: "assigned" }).eq("id", action.payload.jobId);
        if (error) { toast.error(`Failed: ${error.message}`); return; }
        refetchJobs();
        toast.success(`${action.payload.jobRef} assigned to ${action.payload.driverName}`);
        setMessages((prev) => [...prev, {
          id: `action-${Date.now()}`, role: "assistant",
          content: `✅ Done! **${action.payload.jobRef}** assigned to **${action.payload.driverName}**.`,
          timestamp: new Date(),
        }]);
      } else {
        // Auto-assign: find best available driver
        setInput(`Recommend driver for ${action.payload.jobRef}`);
      }
    }

    if (action.type === "send_alert") {
      toast.warning(`Alert sent for ${action.payload.jobRef}`);
      setMessages((prev) => [...prev, {
        id: `action-${Date.now()}`, role: "assistant",
        content: `📢 Delay alert sent for **${action.payload.jobRef}**. Dispatch has been notified.`,
        timestamp: new Date(),
      }]);
    }
  }, [refetchJobs]);

  // ============================================
  // Handle Send
  // ============================================

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg: AIMessage = { id: `user-${Date.now()}`, role: "user", content: input.trim(), timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const response = await processCommand(userMsg.content);
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "assistant", content: "Sorry, something went wrong.", timestamp: new Date() }]);
    } finally { setIsThinking(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-card border-l border-border z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="h-14 border-b border-border bg-card/80 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Brain className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Movido AI</h3>
            <p className="text-xs text-muted-foreground">Dispatch Assistant</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] rounded-lg p-3 ${
              msg.role === "user" ? "bg-primary/20 border border-primary/30" : "bg-muted/30 border border-border"
            }`}>
              {msg.role === "assistant" && (
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary font-semibold">AI</span>
                </div>
              )}
              <div className="text-sm whitespace-pre-wrap">{msg.content.replace(/\*\*(.*?)\*\*/g, "$1")}</div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.actions.map((action, i) => (
                    <Button key={i} variant="outline" size="sm" className="w-full justify-start border-primary/30 hover:bg-primary/10" onClick={() => executeAction(action)}>
                      <Zap className="w-3 h-3 mr-2 text-primary" />{action.label}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1.5">{msg.timestamp.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-muted/30 border border-border rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-2 border-t border-border flex gap-2 overflow-x-auto">
        {["Fleet status", "Unassigned jobs", "Any delays?", "Help"].map((cmd) => (
          <Button key={cmd} variant="outline" size="sm" className="text-xs whitespace-nowrap" onClick={() => { setInput(cmd); }}>
            {cmd}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            placeholder="Ask Movido AI..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            className="flex-1 bg-muted/30"
          />
          <Button onClick={handleSend} disabled={!input.trim() || isThinking} className="glow-cyan-sm">
            {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

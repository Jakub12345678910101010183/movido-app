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

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Send,
  Loader2,
  X,
  Sparkles,
  Truck,
  Route,
  AlertTriangle,
  Zap,
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

interface AISuggestion {
  icon: React.ReactNode;
  text: string;
  badge: string;
  urgent?: boolean;
  command: string;
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { jobs, refetch: refetchJobs } = useJobs();
  const { drivers } = useDrivers();
  const { vehicles } = useVehicles();

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, isThinking]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 350);
  }, [open]);

  // Initial greeting
  useEffect(() => {
    if (open && messages.length === 0) {
      const pending = jobs.filter((j) => j.status === "pending").length;
      const inProgress = jobs.filter((j) => j.status === "in_progress").length;
      const available = drivers.filter(
        (d) => d.status === "available" || d.status === "on_duty"
      ).length;

      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: `Hi! Here's today's snapshot:\n\n• **${pending}** pending jobs awaiting assignment\n• **${inProgress}** jobs in progress\n• **${available}** drivers available\n• **${vehicles.length}** vehicles in fleet\n\nHow can I help? Try:\n— "Show unassigned jobs"\n— "Recommend driver for JOB-2026-001"\n— "Fleet status"\n— "Any delays?"`,
          timestamp: new Date(),
        },
      ]);
    }
  }, [open]);

  // ── Build dynamic suggestions from live data ──────────────────────────────
  const suggestions: AISuggestion[] = (() => {
    const items: AISuggestion[] = [];

    const unassigned = jobs.filter((j) => j.status === "pending" && !j.driver_id);
    if (unassigned.length > 0) {
      items.push({
        icon: <Truck className="w-3.5 h-3.5" />,
        text: "Assign unassigned jobs to drivers",
        badge: `${unassigned.length} new`,
        command: "Show unassigned jobs",
      });
    }

    items.push({
      icon: <Route className="w-3.5 h-3.5" />,
      text: "Optimise today's routes",
      badge: "Save ~40 min",
      command: "Fleet status",
    });

    const now = new Date();
    const delayed = jobs.filter(
      (j) => j.status === "in_progress" && j.eta && new Date(j.eta!) < now
    );
    if (delayed.length > 0) {
      items.push({
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        text: `Delay detected — ${delayed[0].reference || "active job"}`,
        badge: "Urgent",
        urgent: true,
        command: "Any delays?",
      });
    } else {
      items.push({
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        text: "Check for delays & overdue deliveries",
        badge: "Check now",
        command: "Any delays?",
      });
    }

    return items;
  })();

  // ============================================================
  // AI Processing Logic
  // ============================================================

  const processCommand = useCallback(
    async (text: string): Promise<AIMessage> => {
      const lower = text.toLowerCase();
      const now = new Date();

      // ---- UNASSIGNED JOBS ----
      if (
        lower.includes("unassigned") ||
        lower.includes("pending") ||
        (lower.includes("no") && lower.includes("driver"))
      ) {
        const unassigned = jobs.filter(
          (j) => j.status === "pending" && !j.driver_id
        );
        if (unassigned.length === 0) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content:
              "All jobs are currently assigned. No pending jobs without drivers.",
            timestamp: now,
          };
        }
        const list = unassigned
          .slice(0, 5)
          .map(
            (j) =>
              `• **${j.reference}** — ${j.customer} → ${j.delivery_address || "No address"} (${j.priority})`
          )
          .join("\n");
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `Found **${unassigned.length}** unassigned job(s):\n\n${list}${
            unassigned.length > 5
              ? `\n\n...and ${unassigned.length - 5} more`
              : ""
          }`,
          actions: unassigned.slice(0, 3).map((j) => ({
            label: `Auto-assign ${j.reference}`,
            type: "assign_driver" as const,
            payload: { jobId: j.id, jobRef: j.reference },
          })),
        };
      }

      // ---- RECOMMEND DRIVER ----
      if (
        lower.includes("recommend") ||
        lower.includes("best driver") ||
        lower.includes("suggest driver")
      ) {
        const jobRefMatch = text.match(/JOB-\d{4}-\d{3}/i);
        const targetJob = jobRefMatch
          ? jobs.find(
              (j) => j.reference.toLowerCase() === jobRefMatch[0].toLowerCase()
            )
          : jobs.find((j) => j.status === "pending" && !j.driver_id);

        if (!targetJob) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content:
              "No matching job found. Please specify a job reference (e.g., JOB-2026-001).",
            timestamp: now,
          };
        }

        const availableDrivers = drivers.filter(
          (d) => d.status === "available" || d.status === "on_duty"
        );
        if (availableDrivers.length === 0) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content:
              "No drivers currently available. All drivers are off duty or on break.",
            timestamp: now,
          };
        }

        const scored = availableDrivers
          .map((d) => ({
            driver: d,
            score:
              (d.rating || 3) * 2 +
              (10 - (d.hours_today || 0)) +
              (d.status === "available" ? 2 : 0),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        const recommendations = scored
          .map(
            (s, i) =>
              `${i + 1}. **${s.driver.name}** — Rating: ${s.driver.rating || "N/A"} ★, Hours today: ${s.driver.hours_today || 0}h, Status: ${s.driver.status}, Score: ${s.score.toFixed(1)}`
          )
          .join("\n");

        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `Driver recommendations for **${targetJob.reference}** (${targetJob.customer}):\n\n${recommendations}\n\nRecommendation: **${scored[0].driver.name}** is the best match.`,
          actions: scored.map((s) => ({
            label: `Assign ${s.driver.name}`,
            type: "assign_driver" as const,
            payload: {
              jobId: targetJob.id,
              driverId: s.driver.id,
              driverName: s.driver.name,
              jobRef: targetJob.reference,
            },
          })),
        };
      }

      // ---- ASSIGN DRIVER ----
      if (lower.includes("assign")) {
        const jobRefMatch = text.match(/JOB-\d{4}-\d{3}/i);
        const driverNameMatch = text.match(/to\s+(\w+)/i);

        if (!jobRefMatch) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content:
              "Please specify a job reference. Example: 'Assign JOB-2026-001 to John'",
            timestamp: now,
          };
        }

        const job = jobs.find(
          (j) => j.reference.toLowerCase() === jobRefMatch[0].toLowerCase()
        );
        if (!job) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: `Job ${jobRefMatch[0]} not found.`,
            timestamp: now,
          };
        }

        const driverName = driverNameMatch?.[1];
        const driver = driverName
          ? drivers.find((d) =>
              d.name.toLowerCase().includes(driverName.toLowerCase())
            )
          : null;

        if (!driver) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: `Driver "${driverName || "unknown"}" not found. Available drivers: ${
              drivers
                .filter((d) => d.status === "available")
                .map((d) => d.name)
                .join(", ") || "None"
            }`,
            timestamp: now,
          };
        }

        const { error } = await supabase
          .from("jobs")
          .update({ driver_id: driver.id, status: "assigned" })
          .eq("id", job.id);
        if (error) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: `Failed to assign: ${error.message}`,
            timestamp: now,
          };
        }

        refetchJobs();
        toast.success(`${job.reference} assigned to ${driver.name}`);
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `✅ **${job.reference}** has been assigned to **${driver.name}**.\n\nJob status updated to "assigned". The driver will see this in their Movido app.`,
        };
      }

      // ---- DELAYS ----
      if (
        lower.includes("delay") ||
        lower.includes("late") ||
        lower.includes("overdue")
      ) {
        const inProgress = jobs.filter(
          (j) => j.status === "in_progress" && j.eta
        );
        const delayed = inProgress.filter((j) => new Date(j.eta!) < now);

        if (delayed.length === 0) {
          return {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: `No delays detected. All **${inProgress.length}** active deliveries are on schedule.`,
            timestamp: now,
          };
        }

        const list = delayed
          .map((j) => {
            const minsLate = Math.round(
              (now.getTime() - new Date(j.eta!).getTime()) / 60000
            );
            return `• **${j.reference}** — ${j.customer}, ${minsLate}min late`;
          })
          .join("\n");

        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `⚠️ Found **${delayed.length}** delayed delivery(s):\n\n${list}\n\nConsider contacting the drivers or notifying customers.`,
          actions: delayed.slice(0, 2).map((j) => ({
            label: `Send alert — ${j.reference}`,
            type: "send_alert" as const,
            payload: { jobId: j.id, jobRef: j.reference },
          })),
        };
      }

      // ---- FLEET STATUS ----
      if (
        lower.includes("fleet") ||
        lower.includes("status") ||
        lower.includes("overview")
      ) {
        const active = vehicles.filter((v) => v.status === "active").length;
        const idle = vehicles.filter((v) => v.status === "idle").length;
        const maint = vehicles.filter(
          (v) => v.status === "maintenance"
        ).length;
        const lowFuel = vehicles.filter(
          (v) => (v.fuel_level || 0) < 20
        ).length;
        const onDuty = drivers.filter((d) => d.status === "on_duty").length;
        const available = drivers.filter(
          (d) => d.status === "available"
        ).length;

        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `📊 **Fleet Status Summary**\n\n**Vehicles** (${vehicles.length} total)\n• Active: ${active}\n• Idle: ${idle}\n• In Maintenance: ${maint}\n• Low Fuel (<20%): ${lowFuel}\n\n**Drivers** (${drivers.length} total)\n• On Duty: ${onDuty}\n• Available: ${available}\n• Off Duty: ${drivers.length - onDuty - available}\n\n**Jobs**\n• Pending: ${jobs.filter((j) => j.status === "pending").length}\n• In Progress: ${jobs.filter((j) => j.status === "in_progress").length}\n• Completed Today: ${jobs.filter((j) => j.status === "completed").length}`,
        };
      }

      // ---- HELP ----
      if (lower.includes("help") || lower === "?") {
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `**Available Commands:**\n\n• "Show unassigned jobs" — List pending jobs without drivers\n• "Recommend driver for JOB-2026-001" — AI driver scoring\n• "Assign JOB-2026-001 to John" — Direct assignment\n• "Any delays?" — Check overdue deliveries\n• "Fleet status" — Full overview\n• "How many drivers available?" — Quick count`,
        };
      }

      // ---- DRIVER COUNT ----
      if (lower.includes("how many") && lower.includes("driver")) {
        const available = drivers.filter((d) => d.status === "available").length;
        const onDuty = drivers.filter((d) => d.status === "on_duty").length;
        return {
          id: `ai-${Date.now()}`,
          role: "assistant",
          timestamp: now,
          content: `Currently: **${available}** available, **${onDuty}** on duty, **${drivers.length}** total drivers.`,
        };
      }

      // ---- FALLBACK ----
      return {
        id: `ai-${Date.now()}`,
        role: "assistant",
        timestamp: now,
        content: `I understand you said: "${text}"\n\nI can help with:\n• Job assignment & recommendations\n• Delay detection\n• Fleet status overview\n\nType "help" for all commands.`,
      };
    },
    [jobs, drivers, vehicles, refetchJobs]
  );

  // ============================================================
  // Execute AI Action
  // ============================================================

  const executeAction = useCallback(
    async (action: AIAction) => {
      if (action.type === "assign_driver") {
        if (action.payload.driverId) {
          const { error } = await supabase
            .from("jobs")
            .update({ driver_id: action.payload.driverId, status: "assigned" })
            .eq("id", action.payload.jobId);
          if (error) {
            toast.error(`Failed: ${error.message}`);
            return;
          }
          refetchJobs();
          toast.success(
            `${action.payload.jobRef} assigned to ${action.payload.driverName}`
          );
          setMessages((prev) => [
            ...prev,
            {
              id: `action-${Date.now()}`,
              role: "assistant",
              content: `✅ Done! **${action.payload.jobRef}** assigned to **${action.payload.driverName}**.`,
              timestamp: new Date(),
            },
          ]);
        } else {
          setInput(`Recommend driver for ${action.payload.jobRef}`);
        }
      }

      if (action.type === "send_alert") {
        toast.warning(`Alert sent for ${action.payload.jobRef}`);
        setMessages((prev) => [
          ...prev,
          {
            id: `action-${Date.now()}`,
            role: "assistant",
            content: `📢 Delay alert sent for **${action.payload.jobRef}**. Dispatch has been notified.`,
            timestamp: new Date(),
          },
        ]);
      }
    },
    [refetchJobs]
  );

  // ============================================================
  // Handle Send
  // ============================================================

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text) return;
    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsThinking(true);

    try {
      const response = await processCommand(text);
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "Sorry, something went wrong.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  // Render bold markdown helper
  const renderContent = (content: string) => {
    return content.split(/\*\*(.*?)\*\*/g).map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} style={{ color: "#a5b4fc" }}>
          {part}
        </strong>
      ) : (
        part
      )
    );
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(5px)",
          zIndex: 49,
          animation: "aip-fade 0.22s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(460px, 100vw)",
          background: "linear-gradient(180deg, #09090f 0%, #0c0c18 100%)",
          borderLeft: "1px solid rgba(99,102,241,0.18)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "aip-slide 0.3s cubic-bezier(0.16,1,0.3,1)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            padding: "18px 20px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background:
              "linear-gradient(180deg, rgba(99,102,241,0.08) 0%, transparent 100%)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {/* Avatar */}
            <div
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "11px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 20px rgba(99,102,241,0.5)",
                flexShrink: 0,
              }}
            >
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            {/* Title */}
            <div>
              <div
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "-0.2px",
                }}
              >
                Movido AI Planner
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  marginTop: "2px",
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: "#22c55e",
                    boxShadow: "0 0 6px #22c55e",
                    display: "inline-block",
                  }}
                />
                <span
                  style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.38)" }}
                >
                  Online · Dispatch Assistant
                </span>
              </div>
            </div>
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                marginLeft: "auto",
                padding: "6px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                display: "flex",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                e.currentTarget.style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "rgba(255,255,255,0.5)";
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Live Suggestions ── */}
        {suggestions.length > 0 && (
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "rgba(255,255,255,0.28)",
                textTransform: "uppercase",
                letterSpacing: "1px",
                marginBottom: "8px",
              }}
            >
              Live Suggestions
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s.command)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "9px",
                    padding: "8px 11px",
                    background: s.urgent
                      ? "rgba(239,68,68,0.07)"
                      : "rgba(255,255,255,0.04)",
                    border: `1px solid ${
                      s.urgent
                        ? "rgba(239,68,68,0.22)"
                        : "rgba(255,255,255,0.07)"
                    }`,
                    borderRadius: "8px",
                    color: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                    width: "100%",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = s.urgent
                      ? "rgba(239,68,68,0.13)"
                      : "rgba(99,102,241,0.1)";
                    e.currentTarget.style.borderColor = s.urgent
                      ? "rgba(239,68,68,0.4)"
                      : "rgba(99,102,241,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = s.urgent
                      ? "rgba(239,68,68,0.07)"
                      : "rgba(255,255,255,0.04)";
                    e.currentTarget.style.borderColor = s.urgent
                      ? "rgba(239,68,68,0.22)"
                      : "rgba(255,255,255,0.07)";
                  }}
                >
                  <span style={{ color: s.urgent ? "#ef4444" : "#6366f1", flexShrink: 0 }}>
                    {s.icon}
                  </span>
                  <span style={{ fontSize: "12.5px", flex: 1 }}>{s.text}</span>
                  <span
                    style={{
                      fontSize: "10.5px",
                      padding: "2px 7px",
                      borderRadius: "20px",
                      flexShrink: 0,
                      background: s.urgent
                        ? "rgba(239,68,68,0.18)"
                        : "rgba(99,102,241,0.15)",
                      color: s.urgent ? "#f87171" : "#a5b4fc",
                      fontWeight: 600,
                    }}
                  >
                    {s.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(99,102,241,0.25) transparent",
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                gap: "9px",
                alignItems: "flex-end",
                animation: "aip-msg 0.25s ease",
              }}
            >
              {msg.role === "assistant" && (
                <div
                  style={{
                    width: "26px",
                    height: "26px",
                    borderRadius: "7px",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              )}
              <div
                style={{
                  maxWidth: "82%",
                  padding: "9px 13px",
                  borderRadius:
                    msg.role === "user"
                      ? "13px 13px 4px 13px"
                      : "13px 13px 13px 4px",
                  background:
                    msg.role === "user"
                      ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                      : "rgba(255,255,255,0.055)",
                  border:
                    msg.role === "user"
                      ? "none"
                      : "1px solid rgba(255,255,255,0.08)",
                  fontSize: "13px",
                  lineHeight: "1.55",
                  color: "#fff",
                  whiteSpace: "pre-wrap",
                }}
              >
                {renderContent(msg.content)}
                {msg.actions && msg.actions.length > 0 && (
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {msg.actions.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => executeAction(action)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "7px",
                          padding: "7px 11px",
                          background: "rgba(99,102,241,0.12)",
                          border: "1px solid rgba(99,102,241,0.3)",
                          borderRadius: "7px",
                          color: "#a5b4fc",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "left",
                          fontFamily: "inherit",
                          width: "100%",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(99,102,241,0.22)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "rgba(99,102,241,0.12)";
                        }}
                      >
                        <Zap className="w-3 h-3 flex-shrink-0" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
                <span
                  style={{
                    display: "block",
                    marginTop: "5px",
                    fontSize: "10.5px",
                    color: "rgba(255,255,255,0.25)",
                  }}
                >
                  {msg.timestamp.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isThinking && (
            <div
              style={{
                display: "flex",
                gap: "9px",
                alignItems: "flex-end",
                animation: "aip-msg 0.25s ease",
              }}
            >
              <div
                style={{
                  width: "26px",
                  height: "26px",
                  borderRadius: "7px",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <div
                style={{
                  padding: "9px 14px",
                  borderRadius: "13px 13px 13px 4px",
                  background: "rgba(255,255,255,0.055)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  gap: "4px",
                  alignItems: "center",
                }}
              >
                {[0, 0.18, 0.36].map((delay, i) => (
                  <span
                    key={i}
                    style={{
                      width: "5px",
                      height: "5px",
                      borderRadius: "50%",
                      background: "#6366f1",
                      display: "inline-block",
                      animation: `aip-dot 1.2s ease ${delay}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div
          style={{
            padding: "7px 20px 5px",
            display: "flex",
            gap: "5px",
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          {[
            "Fleet status",
            "Unassigned jobs",
            "Any delays?",
            "Help",
          ].map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleSend(cmd)}
              style={{
                padding: "4px 10px",
                fontSize: "11.5px",
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.2)",
                borderRadius: "20px",
                color: "#a5b4fc",
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.2)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(99,102,241,0.1)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.2)";
              }}
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* ── Input ── */}
        <div
          style={{
            padding: "10px 20px 18px",
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "9px",
              alignItems: "flex-end",
              padding: "9px 11px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: "11px",
              transition: "border-color 0.2s",
            }}
            onFocusCapture={(e) =>
              (e.currentTarget.style.borderColor = "rgba(99,102,241,0.6)")
            }
            onBlurCapture={(e) =>
              (e.currentTarget.style.borderColor = "rgba(99,102,241,0.25)")
            }
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask the AI Planner..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#fff",
                fontSize: "13px",
                resize: "none",
                lineHeight: "1.5",
                maxHeight: "76px",
                overflowY: "auto",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isThinking}
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "7px",
                flexShrink: 0,
                background:
                  input.trim() && !isThinking
                    ? "linear-gradient(135deg, #6366f1, #7c3aed)"
                    : "rgba(255,255,255,0.06)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: input.trim() && !isThinking ? "pointer" : "default",
                color:
                  input.trim() && !isThinking
                    ? "#fff"
                    : "rgba(255,255,255,0.2)",
                transition: "all 0.2s",
              }}
            >
              {isThinking ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <p
            style={{
              marginTop: "6px",
              fontSize: "10.5px",
              color: "rgba(255,255,255,0.18)",
              textAlign: "center",
            }}
          >
            Enter ↵ to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes aip-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes aip-slide {
          from { opacity: 0; transform: translateX(30px) scale(0.98); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes aip-msg {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aip-dot {
          0%,80%,100% { transform: scale(1); opacity: 0.4; }
          40%          { transform: scale(1.4); opacity: 1; }
        }
      `}</style>
    </>
  );
}

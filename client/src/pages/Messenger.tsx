/**
 * Messenger Page — Internal Secure Communication
 * Terminal Noir Bloomberg style
 * Features:
 * - Conversation list (drivers + dispatch)
 * - Real-time message delivery via Supabase
 * - Channel badges (dispatch, driver, alert, system)
 * - Read/unread status
 * - Message input with Enter to send
 */

import { useState, useEffect, useRef, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  MessageSquare, Send, Search, Users, User, Shield, Bell,
  ChevronRight, Loader2, Wifi, WifiOff, Radio,
} from "lucide-react";
import { useMessages, useDrivers } from "@/hooks/useSupabaseData";
import { useAuthContext } from "@/contexts/AuthContext";
import type { Message } from "@/lib/database.types";

const channelColors: Record<string, string> = {
  dispatch: "bg-cyan-500/20 text-cyan-400",
  driver: "bg-green-500/20 text-green-400",
  alert: "bg-amber-500/20 text-amber-400",
  system: "bg-purple-500/20 text-purple-400",
};

const channelIcons: Record<string, typeof Shield> = {
  dispatch: Shield,
  driver: User,
  alert: Bell,
  system: Radio,
};

export default function Messenger() {
  const { user, profile } = useAuthContext();
  const { messages, isLoading, send, markAsRead } = useMessages(user?.id);
  const { drivers } = useDrivers();
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build contacts list from drivers + unique senders
  const contacts = useMemo(() => {
    const contactMap = new Map<string, {
      id: string; name: string; role: string;
      lastMessage?: string; lastTime?: string; unread: number;
    }>();

    // Add all drivers as potential contacts
    drivers.forEach((d) => {
      if (d.user_id) {
        contactMap.set(d.user_id, {
          id: d.user_id, name: d.name, role: "driver",
          unread: 0,
        });
      }
    });

    // Enrich with message data
    messages.forEach((msg) => {
      const otherId = msg.sender_id === user?.id ? msg.recipient_id : msg.sender_id;
      if (!otherId) return;

      if (!contactMap.has(otherId)) {
        contactMap.set(otherId, {
          id: otherId, name: `User ${otherId.slice(0, 8)}`, role: "dispatch",
          unread: 0,
        });
      }

      const contact = contactMap.get(otherId)!;
      contact.lastMessage = msg.content.slice(0, 60);
      contact.lastTime = new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

      if (!msg.read && msg.sender_id !== user?.id) {
        contact.unread++;
      }
    });

    return Array.from(contactMap.values())
      .sort((a, b) => (b.lastTime || "").localeCompare(a.lastTime || ""));
  }, [drivers, messages, user?.id]);

  // Filter contacts by search
  const filteredContacts = contacts.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Messages for selected conversation
  const conversation = useMemo(() => {
    if (!selectedContact) return [];
    return messages.filter(
      (m) => m.sender_id === selectedContact || m.recipient_id === selectedContact
    );
  }, [messages, selectedContact]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length]);

  // Mark messages as read when opening conversation
  useEffect(() => {
    if (!selectedContact || !user?.id) return;
    conversation
      .filter((m) => m.sender_id === selectedContact && !m.read)
      .forEach((m) => markAsRead(m.id));
  }, [selectedContact, conversation, user?.id, markAsRead]);

  const handleSend = async () => {
    if (!messageText.trim() || !selectedContact) return;
    setIsSending(true);
    try {
      await send({ recipient_id: selectedContact, content: messageText.trim(), channel: "dispatch" });
      setMessageText("");
    } catch {
      // Error handling
    } finally {
      setIsSending(false);
    }
  };

  const selectedContactInfo = contacts.find((c) => c.id === selectedContact);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* LEFT — Contact List */}
        <div className="w-80 border-r border-border flex flex-col bg-card/30">
          {/* Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">Messenger</h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {contacts.length} contacts
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                className="pl-9 bg-muted/30"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Broadcast button */}
          <div className="p-3 border-b border-border">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-primary/30"
              onClick={() => setSelectedContact("broadcast")}
            >
              <Users className="w-4 h-4 mr-2" />
              Broadcast to All Drivers
            </Button>
          </div>

          {/* Contact list */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No contacts found</p>
                <p className="text-xs text-muted-foreground mt-1">Add drivers to start messaging</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                      selectedContact === contact.id
                        ? "bg-primary/10 border border-primary/30"
                        : "hover:bg-muted/30 border border-transparent"
                    }`}
                    onClick={() => setSelectedContact(contact.id)}
                  >
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        contact.role === "driver" ? "bg-green-500/20" : "bg-primary/20"
                      }`}>
                        <User className={`w-5 h-5 ${
                          contact.role === "driver" ? "text-green-500" : "text-primary"
                        }`} />
                      </div>
                      {contact.unread > 0 && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-xs font-bold text-white">
                          {contact.unread}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-sm truncate">{contact.name}</p>
                        {contact.lastTime && (
                          <span className="text-xs text-muted-foreground font-mono">{contact.lastTime}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${channelColors[contact.role] || channelColors.dispatch}`}>
                          {contact.role}
                        </span>
                        {contact.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* RIGHT — Chat View */}
        <div className="flex-1 flex flex-col bg-terminal">
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="h-14 border-b border-border bg-card/50 flex items-center justify-between px-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    selectedContact === "broadcast" ? "bg-amber-500/20" :
                    selectedContactInfo?.role === "driver" ? "bg-green-500/20" : "bg-primary/20"
                  }`}>
                    {selectedContact === "broadcast" ? (
                      <Users className="w-4 h-4 text-amber-500" />
                    ) : (
                      <User className={`w-4 h-4 ${selectedContactInfo?.role === "driver" ? "text-green-500" : "text-primary"}`} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">
                      {selectedContact === "broadcast" ? "All Drivers" : selectedContactInfo?.name || "Unknown"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {selectedContact === "broadcast" ? `${drivers.length} drivers` : selectedContactInfo?.role || "dispatch"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-green-500">
                  <Wifi className="w-3 h-3" /> Realtime
                </div>
              </div>

              {/* Messages Area */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedContact === "broadcast" ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Broadcast message to all drivers</p>
                    <p className="text-xs mt-1">Type your message below — it will be sent to all active drivers</p>
                  </div>
                ) : conversation.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs mt-1">Send a message to start the conversation</p>
                  </div>
                ) : (
                  conversation.map((msg) => {
                    const isOwn = msg.sender_id === user?.id;
                    const ChannelIcon = channelIcons[msg.channel] || Shield;
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-lg p-3 ${
                          isOwn
                            ? "bg-primary/20 border border-primary/30"
                            : "bg-muted/30 border border-border"
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <ChannelIcon className="w-3 h-3 text-muted-foreground" />
                            <span className={`text-xs ${channelColors[msg.channel] || ""} px-1 rounded`}>
                              {msg.channel}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm">{msg.content}</p>
                          {isOwn && (
                            <div className="flex justify-end mt-1">
                              <span className={`text-xs ${msg.read ? "text-green-500" : "text-muted-foreground"}`}>
                                {msg.read ? "✓✓ Read" : "✓ Sent"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Input */}
              <div className="border-t border-border bg-card/50 p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder={
                      selectedContact === "broadcast"
                        ? "Type broadcast message..."
                        : "Type a message..."
                    }
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                    }}
                    className="flex-1 bg-muted/30"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!messageText.trim() || isSending}
                    className="glow-cyan-sm"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {selectedContact === "broadcast" && (
                  <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
                    <Bell className="w-3 h-3" />
                    This will send to all {drivers.length} drivers
                  </p>
                )}
              </div>
            </>
          ) : (
            /* No conversation selected */
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-semibold mb-1">Movido Messenger</h3>
                <p className="text-sm">Select a contact to start messaging</p>
                <p className="text-xs mt-2">Secure internal communication • Supabase Realtime</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

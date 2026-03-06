/**
 * Driver Messages Screen — Chat with dispatch
 * Simple, fast, minimalist
 */

import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { t } from "../lib/i18n";
import { useDriverAuth } from "../hooks/useDriverAuth";

interface Msg {
  id: number;
  sender_id: string;
  content: string;
  channel: string;
  read: boolean;
  created_at: string;
}

export default function MessagesScreen() {
  const { profile, user } = useDriverAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Fetch messages
  const fetchMessages = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((data || []) as Msg[]);
  };

  useEffect(() => { fetchMessages(); }, [user?.id]);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("driver-messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new as Msg;
        if (msg.sender_id === user.id || msg.recipient_id === user.id) {
          setMessages((prev) => [...prev, msg]);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() || !user?.id) return;
    setSending(true);
    try {
      await supabase.from("messages").insert({
        sender_id: user.id,
        recipient_id: null, // Broadcast to dispatch
        content: text.trim(),
        channel: "driver",
      });
      setText("");
    } catch {}
    finally { setSending(false); }
  };

  const renderMessage = ({ item }: { item: Msg }) => {
    const isOwn = item.sender_id === user?.id;
    return (
      <View style={[s.msgRow, isOwn ? s.msgOwn : s.msgOther]}>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          {!isOwn && <Text style={s.sender}>Dispatch</Text>}
          <Text style={s.msgText}>{item.content}</Text>
          <Text style={s.time}>
            {new Date(item.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerDot} />
        <Text style={s.headerTitle}>Dispatch Channel</Text>
        <Text style={s.headerSub}>Realtime</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          <View style={s.empty}>
            <Ionicons name="chatbubbles-outline" size={40} color="#333" />
            <Text style={s.emptyText}>No messages yet</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={t("msg_placeholder")}
          placeholderTextColor="#555"
          multiline
        />
        <TouchableOpacity
          style={[s.sendBtn, !text.trim() && { opacity: 0.3 }]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          <Ionicons name="send" size={18} color="#000" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#1a1a24" },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" },
  headerTitle: { fontSize: 16, fontWeight: "700", color: "#fff", flex: 1 },
  headerSub: { fontSize: 11, color: "#22C55E" },
  list: { padding: 16, paddingBottom: 8 },
  msgRow: { marginBottom: 8 },
  msgOwn: { alignItems: "flex-end" },
  msgOther: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 12, padding: 10 },
  bubbleOwn: { backgroundColor: "#00FFD420", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#1a1a24", borderBottomLeftRadius: 4 },
  sender: { fontSize: 10, color: "#00FFD4", marginBottom: 2, fontWeight: "600" },
  msgText: { fontSize: 14, color: "#ddd" },
  time: { fontSize: 10, color: "#555", marginTop: 4, textAlign: "right" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: "#1a1a24" },
  input: { flex: 1, backgroundColor: "#111118", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: "#fff", fontSize: 14, maxHeight: 80 },
  sendBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: "#00FFD4", alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyText: { color: "#444", marginTop: 8 },
});

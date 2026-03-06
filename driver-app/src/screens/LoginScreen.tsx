/**
 * Driver Login Screen — Minimalist dark UI, i18n support
 */

import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useDriverAuth } from "../hooks/useDriverAuth";
import { useLanguage } from "../hooks/useLanguage";
import { t, LANGUAGES } from "../lib/i18n";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useDriverAuth();
  const { lang, changeLanguage } = useLanguage();

  const handleLogin = async () => {
    if (!email || !password) { setError(t("login_error_empty")); return; }
    setError(""); setLoading(true);
    try { await signIn(email, password); }
    catch (err: any) { setError(err.message || t("login_error_failed")); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <View style={s.inner}>
        <View style={s.langRow}>
          {LANGUAGES.map((l) => (
            <TouchableOpacity key={l.code} style={[s.langBtn, lang === l.code && s.langBtnActive]} onPress={() => changeLanguage(l.code)}>
              <Text style={{ fontSize: 18 }}>{l.flag}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.logoBox}>
          <Text style={s.logoText}>{t("login_title")}</Text>
          <Text style={s.subtitle}>{t("login_subtitle")}</Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>{t("login_email")}</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder={t("login_email_placeholder")} placeholderTextColor="#555" keyboardType="email-address" autoCapitalize="none" />
          <Text style={[s.label, { marginTop: 16 }]}>{t("login_password")}</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="••••••••" placeholderTextColor="#555" secureTextEntry />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={s.buttonText}>{t("login_button")}</Text>}
          </TouchableOpacity>
        </View>
        <Text style={s.footer}>{t("login_footer")}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0f" },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: 32 },
  langRow: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 32 },
  langBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#111118", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#222" },
  langBtnActive: { borderColor: "#00FFD4", backgroundColor: "#00FFD410" },
  logoBox: { alignItems: "center", marginBottom: 48 },
  logoText: { fontSize: 32, fontWeight: "800", color: "#00FFD4", letterSpacing: 4 },
  subtitle: { fontSize: 14, color: "#666", marginTop: 4 },
  form: {},
  label: { fontSize: 12, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 },
  input: { backgroundColor: "#111118", borderWidth: 1, borderColor: "#222", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 14, color: "#fff", fontSize: 16 },
  error: { color: "#ef4444", fontSize: 13, marginTop: 12 },
  button: { backgroundColor: "#00FFD4", borderRadius: 8, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  buttonText: { color: "#000", fontSize: 16, fontWeight: "700" },
  footer: { textAlign: "center", color: "#444", fontSize: 11, marginTop: 48 },
});

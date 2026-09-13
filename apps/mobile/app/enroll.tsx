import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C, R, SP, T, CARD_SHADOW } from "../lib/theme";
import { enrollAgent, nationalDigits } from "../lib/agent";
import { API_URL } from "../lib/api";

const PIN_LENGTH = 6;

/**
 * Agent enrolment — the first screen on a handset that has nobody signed in.
 *
 * The number and PIN are the ones an admin registered for this agent in the
 * console; they are checked against the server before anything is stored, so a
 * handset can only ever drive an account that exists and is active.
 */
export default function Enroll() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pinRef = useRef<TextInput>(null);

  const digits = nationalDigits(phone);
  const phoneReady = /^[79]\d{8}$/.test(digits);
  const pinReady = pin.length === PIN_LENGTH;
  const ready = phoneReady && pinReady && !busy;

  const submit = useCallback(async () => {
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await enrollAgent(digits, pin);
      // Replaced, not pushed: there is no going back to enrolment once in.
      router.replace("/");
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setPin("");
      pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }, [ready, digits, pin, router]);

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* The inset is painted outside the scroller, so the card cannot slide up
          under the clock when the keyboard shortens the view. */}
      <View style={{ height: insets.top }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: SP.xxl, paddingBottom: SP.xxl }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.brand}>
          <View style={s.logo}>
            <Feather name="zap" size={22} color={C.accent} />
          </View>
          <Text style={s.title}>AutoPilot</Text>
          <Text style={s.subtitle}>Sign in with your agent number and PIN</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Agent phone number</Text>
          <View style={[s.field, phoneReady && s.fieldOk]}>
            <Text style={s.prefix}>+251</Text>
            <TextInput
              style={s.input}
              value={digits}
              onChangeText={(text) => setPhone(nationalDigits(text).slice(0, 9))}
              placeholder="9XXXXXXXX"
              placeholderTextColor={C.faint}
              keyboardType="number-pad"
              maxLength={9}
              autoFocus
              editable={!busy}
              returnKeyType="next"
              onSubmitEditing={() => pinRef.current?.focus()}
            />
            {phoneReady && <Feather name="check" size={16} color={C.green} />}
          </View>

          <Text style={[s.label, { marginTop: 4 }]}>Telebirr PIN</Text>
          {/* One hidden field behind six boxes: a real PIN keypad per digit is
              fiddly on Android, and this keeps paste and backspace working. */}
          <Pressable onPress={() => pinRef.current?.focus()}>
            <View style={s.pinRow}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <View key={i} style={[s.pinBox, i < pin.length && s.pinBoxFilled]}>
                  {i < pin.length ? <View style={s.pinDot} /> : null}
                </View>
              ))}
            </View>
            <TextInput
              ref={pinRef}
              style={s.hiddenInput}
              value={pin}
              onChangeText={(text) => {
                setPin(text.replace(/\D/g, "").slice(0, PIN_LENGTH));
                setError("");
              }}
              keyboardType="number-pad"
              maxLength={PIN_LENGTH}
              editable={!busy}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={submit}
            />
          </Pressable>

          {!!error && (
            <View style={s.errorBox}>
              <Feather name="alert-triangle" size={15} color={C.red} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [
              s.primaryBtn,
              !ready && s.primaryBtnOff,
              pressed && ready && s.pressed,
            ]}
            onPress={submit}
            disabled={!ready}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="log-in" size={16} color="#fff" />
            )}
            <Text style={s.primaryBtnText}>{busy ? "Checking…" : "Sign in"}</Text>
          </Pressable>

          <Text style={s.footnote}>
            Your office registers this number and PIN for you. The PIN is the one telebirr asks
            for — AutoPilot stores it on this phone so it can sign in for you.
          </Text>
        </View>

        {/* Without a server address the button can only ever fail, so say so
            here rather than after a tap and a timeout. */}
        {!API_URL && (
          <View style={s.noticeBox}>
            <Feather name="wifi-off" size={15} color={C.amber} />
            <Text style={s.noticeText}>
              This build has no server address. Set EXPO_PUBLIC_API_URL in apps/mobile/.env to the
              API's address on your network.
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  brand: { alignItems: "center", gap: 10, paddingHorizontal: 28, paddingBottom: 26 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accentSoft,
  },
  title: { fontSize: 23, fontWeight: "700", color: C.text, letterSpacing: -0.5 },
  subtitle: { ...T.small, color: C.dim, textAlign: "center", lineHeight: 19 },

  card: {
    marginHorizontal: SP.gutter,
    padding: SP.xl,
    gap: SP.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    ...CARD_SHADOW,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: C.faint,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 48,
    paddingHorizontal: 12,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  fieldOk: { borderColor: "#bfd2ff", backgroundColor: C.surface },
  prefix: { fontSize: 15, color: C.dim, fontFamily: "monospace" },
  input: { flex: 1, fontSize: 16, color: C.text, fontFamily: "monospace", letterSpacing: 1 },

  pinRow: { flexDirection: "row", gap: 8 },
  pinBox: {
    flex: 1,
    height: 50,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBoxFilled: { borderColor: "#bfd2ff", backgroundColor: C.surface },
  pinDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.text },
  // Off-screen rather than display:none, which would stop it taking focus.
  hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    marginTop: 6,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  primaryBtnOff: { backgroundColor: "#a9c0f5" },
  primaryBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  pressed: { opacity: 0.75 },

  footnote: { ...T.micro, color: C.faint, lineHeight: 16 },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 11,
    borderRadius: R.row,
    backgroundColor: C.redSoft,
  },
  errorText: { flex: 1, fontSize: 12, color: C.red, lineHeight: 17 },
  noticeBox: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 12,
    borderRadius: R.row,
    backgroundColor: C.amberSoft,
  },
  noticeText: { flex: 1, fontSize: 12, color: C.amber, lineHeight: 17 },
});

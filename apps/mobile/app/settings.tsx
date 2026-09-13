import {
  Alert,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C, R, CARD_SHADOW } from "../lib/theme";
import { useAccessibility } from "../lib/accessibility";
import { useAgent } from "../lib/agent";
import { maskPhone } from "../lib/telebirrData";

/** What Android's own settings screen calls the service, so the steps match. */
const SERVICE_NAME = "AutoPilot";

/** Granting happens in Android settings, so the steps are spelled out here. */
const STEPS = [
  "Tap the button below — Android opens its Accessibility list",
  `Find ${SERVICE_NAME} under Downloaded apps or Installed services`,
  "Turn the switch on and accept Android's prompt",
];

/** Everything the app cannot do until access is granted. */
const GRANTS = [
  { icon: "eye" as const, text: "Read the balance and receipts off telebirr" },
  { icon: "mouse-pointer" as const, text: "Fill your number and PIN, and tap through menus" },
  { icon: "send" as const, text: "Run sends and saved macros end to end" },
];

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Shared with the home screen's banner, so both read the same live state —
  // including the gap where the switch is on but Android has not bound the
  // service yet, when automation still cannot run.
  const access = useAccessibility();
  const { agent, signOut } = useAgent();

  // Signing out wipes the stored PIN, so the handset can no longer sign in to
  // telebirr as anyone — worth a confirmation.
  const confirmSignOut = () => {
    Alert.alert(
      "Sign out of AutoPilot?",
      "This phone will forget your number and PIN. You will need them again to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/enroll");
          },
        },
      ]
    );
  };

  const checking = access.state === "checking";
  const starting = access.state === "starting";
  const on = access.on;
  const returnedWithoutAccess = access.returnedWithoutAccess;
  const openAndroidSettings = access.open;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={{ height: insets.top }} />

      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={6}>
          <Feather name="chevron-left" size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Settings</Text>
          <Text style={s.subtitle}>Permissions and automation</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>Agent</Text>

      <View style={s.card}>
        <View style={s.statusRow}>
          <View style={[s.tile, { backgroundColor: C.accentSoft }]}>
            <Feather name="user" size={19} color={C.accent} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.cardTitle}>{agent?.fullName ?? "Not signed in"}</Text>
            <Text style={s.dim}>
              {agent
                ? `${maskPhone(agent.phoneNationalDigits)}${
                    agent.businessName ? ` · ${agent.businessName}` : ""
                  }`
                : "Enrol with your agent number and PIN"}
            </Text>
          </View>
        </View>
        <View style={s.divider} />
        <Pressable
          style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
          onPress={agent ? confirmSignOut : () => router.replace("/enroll")}
        >
          <Feather name={agent ? "log-out" : "log-in"} size={15} color={C.dim} />
          <Text style={s.secondaryBtnText}>{agent ? "Sign out" : "Sign in"}</Text>
        </Pressable>
      </View>

      <Text style={s.sectionLabel}>Accessibility</Text>

      <View style={s.card}>
        {/* Status — the one thing to see at a glance. */}
        <View style={s.statusRow}>
          <View style={[s.tile, { backgroundColor: on ? C.greenSoft : C.amberSoft }]}>
            {checking || starting ? (
              <ActivityIndicator size="small" color={C.dim} />
            ) : (
              <Feather
                name={on ? "shield" : "shield-off"}
                size={20}
                color={on ? C.green : C.amber}
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.cardTitle}>Accessibility access</Text>
            <Text style={s.dim}>
              {checking
                ? "Checking the service…"
                : starting
                ? "Switched on — Android is connecting the service"
                : on
                ? "AutoPilot can drive telebirr for you"
                : "AutoPilot cannot read or tap anything yet"}
            </Text>
          </View>
        </View>

        <View
          style={[
            s.pill,
            {
              backgroundColor: checking ? C.surfaceAlt : on ? C.greenSoft : C.amberSoft,
              borderColor: checking ? C.border : "transparent",
            },
          ]}
        >
          <View
            style={[s.pillDot, { backgroundColor: checking ? C.faint : on ? C.green : C.amber }]}
          />
          <Text style={[s.pillText, { color: checking ? C.dim : on ? C.green : C.amber }]}>
            {checking ? "Checking" : starting ? "Starting" : on ? "Access granted" : "No access"}
          </Text>
        </View>

        <View style={s.divider} />

        {on ? (
          <>
            {/* Granted: say what it is being used for, and keep a way back. */}
            <View style={{ gap: 10 }}>
              {GRANTS.map((grant) => (
                <View key={grant.text} style={s.grantRow}>
                  <Feather name={grant.icon} size={14} color={C.green} />
                  <Text style={s.grantText}>{grant.text}</Text>
                </View>
              ))}
            </View>
            <Pressable
              style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
              onPress={openAndroidSettings}
            >
              <Feather name="external-link" size={15} color={C.dim} />
              <Text style={s.secondaryBtnText}>Manage in Android settings</Text>
            </Pressable>
            <Text style={s.footnote}>
              Turning the service off in Android settings stops every automation at once.
            </Text>
          </>
        ) : (
          <>
            {/* Off: the three taps it takes, then the button that starts them.
                Mid-bind there is nothing to do but wait, so the steps go away. */}
            {starting ? (
              <Text style={s.dim}>
                The switch is on. Android binds the service a moment later — automation works as
                soon as this turns green, with nothing more to tap.
              </Text>
            ) : (
            <View style={{ gap: 10 }}>
              {STEPS.map((step, i) => (
                <View key={step} style={s.stepRow}>
                  <View style={s.stepNum}>
                    <Text style={s.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}
            </View>
            )}
            {!starting && (
              <Pressable
                style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
                onPress={openAndroidSettings}
                disabled={checking}
              >
                <Feather name="unlock" size={16} color="#fff" />
                <Text style={s.primaryBtnText}>Grant accessibility access</Text>
              </Pressable>
            )}
            {returnedWithoutAccess ? (
              <View style={s.noticeBox}>
                <Feather name="alert-triangle" size={14} color={C.amber} />
                <Text style={s.noticeText}>
                  Still off. The switch for {SERVICE_NAME} has to be turned on — this screen
                  updates by itself once it is.
                </Text>
              </View>
            ) : (
              <Text style={s.footnote}>
                Android asks for this because AutoPilot reads other apps' screens. Nothing leaves
                your phone.
              </Text>
            )}
          </>
        )}
      </View>

      <Text style={s.sectionLabel}>Automation</Text>

      <View style={s.listCard}>
        <Pressable
          style={({ pressed }) => [s.listRow, pressed && s.pressedRow]}
          onPress={() => router.push("/dashboard")}
        >
          <Feather name="sliders" size={17} color={C.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.listTitle}>Macros</Text>
            <Text style={s.dim}>Saved AutoPilot routines</Text>
          </View>
          <Feather name="chevron-right" size={15} color="#aab5c9" />
        </Pressable>
        <View style={s.divider} />
        <Pressable
          style={({ pressed }) => [s.listRow, pressed && s.pressedRow]}
          onPress={() => router.push("/scrape")}
        >
          <Feather name="crosshair" size={17} color={C.accent} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.listTitle}>Live scrape</Text>
            <Text style={s.dim}>See what the service reads on screen</Text>
          </View>
          <Feather name="chevron-right" size={15} color="#aab5c9" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    marginLeft: -12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.row,
  },
  title: { fontSize: 19, fontWeight: "600", color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.dim, marginTop: 1 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: C.dim,
    marginHorizontal: 20,
    marginTop: 18,
    marginBottom: 10,
  },

  card: {
    marginHorizontal: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    padding: 18,
    gap: 14,
    ...CARD_SHADOW,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tile: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "600", color: C.text, letterSpacing: -0.2 },
  dim: { fontSize: 12, color: C.dim, lineHeight: 17 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: R.pill,
    borderWidth: 1,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: "600" },

  divider: { height: 1, backgroundColor: C.divider },

  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.accentSoft,
  },
  stepNumText: { fontSize: 11, fontWeight: "700", color: C.accent },
  stepText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },

  grantRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  grantText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 19 },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 46,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  primaryBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: "600", color: C.dim },
  pressed: { opacity: 0.75 },
  pressedRow: { backgroundColor: C.surfaceAlt },

  footnote: { fontSize: 11, color: C.faint, lineHeight: 16 },
  noticeBox: {
    flexDirection: "row",
    gap: 8,
    padding: 11,
    borderRadius: R.row,
    backgroundColor: C.amberSoft,
  },
  noticeText: { flex: 1, fontSize: 12, color: C.amber, lineHeight: 17 },

  listCard: {
    marginHorizontal: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    overflow: "hidden",
    ...CARD_SHADOW,
  },
  listRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  listTitle: { fontSize: 14, fontWeight: "500", color: C.text },
});

import { useState } from "react";
import { View, Text, Pressable, Linking, TextInput } from "react-native";
import { useRouter, type Href } from "expo-router";
import { groupedNavWithLocks, FUNNEL, AURORA_NAV_ICONS, type AuroraIconName, type NavGroup } from "@hybrid/core";
import { track } from "../../lib/track";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { useFlags } from "../../lib/flags";
import { WEB_APP_URL } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, Screen, Kicker, Mono, H1, F } from "../../lib/ui";
import { AuroraScreen } from "../../components/aurora/kit";
import { AuroraIcon } from "../../components/aurora/icons";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { useTemplate } from "../../lib/template";

// ── SPRINGBOARD — the app library ───────────────────────────────────────────
// A searchable grid of feature LAUNCHER TILES (icon-in-a-chip + short label),
// grouped by the canonical cluster (Home/Train/Analyze/Recovery/Social/Teams/
// Account) with a mono uppercase section header + count. Tapping a tile navigates
// straight to that feature; the search field filters tiles by label. The tool set
// AND its gating come from the SHARED nav model (groupedNavWithLocks) — the exact
// same source the web menu uses, so the two clients can't drift. Premium (Full)
// tools a free user hasn't unlocked wear a lime LOCK badge and route to /upgrade;
// tools that only exist on the web app show a small blue dot and open the web app.

// Mobile route for each nav id. Ids the user has access to but that AREN'T here
// live on the web app only — surfaced inside their area with a "web" tag + a tap
// that opens the web app (so granted access is never silently invisible).
const HREF: Record<string, Href> = {
  today: "/(tabs)",
  cockpit: "/(tabs)/cockpit",
  notifications: "/notifications",
  log: "/workout?source=empty",
  timer: "/interval-timer",
  runtrack: "/run-track",
  calendar: "/calendar",
  builder: "/builder",
  plans: "/(tabs)/plans",
  periodize: "/periodize",
  sport: "/(tabs)/sport",
  competition: "/competition",
  statistics: "/statistics",
  performance: "/performance",
  volume: "/volume",
  exercises: "/exercises",
  trends: "/trends",
  velocity: "/(tabs)/velocity",
  running: "/(tabs)/running",
  forceplate: "/forceplate",
  video: "/video",
  history: "/(tabs)/history",
  checkin: "/checkin",
  nutrition: "/nutrition",
  progress: "/progress",
  longevity: "/longevity",
  feed: "/feed",
  discover: "/discover",
  leaderboard: "/leaderboard",
  coaches: "/coaches",
  coach: "/(tabs)/coach",
  talent: "/talent",
  tactical: "/tactical",
  profile: "/(tabs)/you",
  connections: "/connections",
  settings: "/settings",
  onboarding: "/onboarding",
};

const GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", social: "Social", teams: "Teams & coaching", account: "Account",
};

// Per-area glyph + accent — the Spectrum coding (Train=chartreuse, Analyze=teal,
// Recovery=sand, Social=violet, Teams=terracotta) so the seven cards read at a
// glance by colour, not just text.
const GROUP_META: Record<NavGroup, { icon: AuroraIconName; ck: keyof Palette }> = {
  home: { icon: "village", ck: "lime" },
  train: { icon: "list-check", ck: "lime" },
  analyze: { icon: "search", ck: "blue" },
  recovery: { icon: "check-circle", ck: "amber" },
  social: { icon: "share", ck: "violet" },
  teams: { icon: "user-square", ck: "red" },
  account: { icon: "user-circle", ck: "ash" },
};

type HubItem = { id: string; label: string; icon: AuroraIconName; href: Href | null; locked: boolean };

export default function More() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  const aurora = useTemplate().template === "aurora";
  const rCard = aurora ? 22 : 14;
  const { signOut, role, entitlement, name } = useSession();
  const initials = ((name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();
  const persona = usePersona();
  const access = useNavAccess();
  const { isEnabled } = useFlags();
  // Springboard search — filters the launcher tiles by (localized) label.
  const [query, setQuery] = useState("");

  const navLabel = (id: string, fallback: string) => { const k = "nav." + id; const v = t(k); return v === k ? fallback : v; };
  const groupLabel = (g: NavGroup) => { const k = "nav.group." + g; const v = t(k); return v === k ? GROUP_LABEL[g] : v; };

  // Build the seven areas from the SHARED canonical nav, filtered to this
  // persona + the admin's access override — the exact set the web sidebar shows.
  // groupedNav already drops groups with no items for this persona, but keep an
  // explicit guard so a card (and its items[0] preview) can never render empty.
  // Premium (Full) items a free user hasn't unlocked are shown LOCKED (🔒) here
  // rather than hidden, so the whole toolkit is visible; tapping one upsells.
  const areas: { group: NavGroup; items: HubItem[] }[] = groupedNavWithLocks(persona, access)
    .map(({ group, items }) => ({
      group: group as NavGroup,
      items: items
        // Drop tools whose `nav.<id>` feature flag is off — the same gate the web
        // surfaces apply, so the tool set stays in lockstep across all clients.
        .filter(({ item: i }) => isEnabled(`nav.${i.id}`))
        .map(({ item: i, locked }) => ({ id: i.id, label: navLabel(i.id, i.label), icon: AURORA_NAV_ICONS[i.id] ?? "info", href: HREF[i.id] ?? null, locked })),
    }))
    .filter((a) => a.items.length > 0);
  // Onboarding is a re-runnable setup FLOW (not a nav item), so inject it into Train.
  const train = areas.find((a) => a.group === "train");
  if (train && !train.items.some((i) => i.id === "onboarding")) {
    train.items.push({ id: "onboarding", label: navLabel("onboarding", "Get started"), icon: AURORA_NAV_ICONS["onboarding"] ?? "navigation", href: HREF.onboarding, locked: false });
  }

  const openWeb = () => Linking.openURL(WEB_APP_URL).catch(() => {});
  const go = (it: HubItem) => {
    if (it.locked) { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: `more-${it.id}` }); router.push("/upgrade"); return; }
    it.href ? router.push(it.href) : openWeb();
  };

  // Springboard filter — match the (localized) label against the query; drop
  // clusters left empty by the filter so the grid stays tight.
  const q = query.trim().toLowerCase();
  // Tool count for the search placeholder. Kept in agreement with the web More
  // surfaces (drawer + pill-nav sheet): both count the persona-gated nav tools.
  // The injected "onboarding" tile is a re-runnable SETUP FLOW that only exists on
  // mobile, so it's excluded from the count (it still renders as a tile). The
  // nav-flag gate is already applied to `areas` above (useFlags), matching web.
  const totalTools = areas.reduce((n, a) => n + a.items.filter((it) => it.id !== "onboarding").length, 0);
  const filteredAreas = q
    ? areas.map((a) => ({ ...a, items: a.items.filter((it) => it.label.toLowerCase().includes(q)) })).filter((a) => a.items.length > 0)
    : areas;

  // ── HUB VIEW — identity + the springboard ──
  const cardRow = { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: rCard, padding: 15, flexDirection: "row" as const, alignItems: "center" as const, gap: 13 };

  const body = (
    <>
      <Kicker>{t("nav.more")}</Kicker>
      <H1>{t("more.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("more.intro")}</Mono>

      {/* Identity — profile, with a Settings shortcut (the cog people expect). */}
      <View style={{ ...cardRow, marginTop: 16 }}>
        <Pressable onPress={() => router.push("/(tabs)/you")} style={{ flexDirection: "row", alignItems: "center", gap: 13, flex: 1 }}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${C.lime}22`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{name || t("nav.you")}</Text>
            <Mono style={{ marginTop: 3, fontSize: fs.micro }}>{[role.toUpperCase(), entitlement === "paid" ? "FULL" : "FREE"].join(" · ")}</Mono>
          </View>
        </Pressable>
        <Pressable onPress={() => router.push("/settings")} hitSlop={10} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="settings" size={19} color={C.chalk} />
        </Pressable>
      </View>

      {/* The Simple/Full mode tabs are retired — paid clients are Full by default
          (see resolvePersona), and free users have the Unlock-Full card below, so
          the two-tab selector was redundant. The Coach on-ramp stays. */}
      {role === "client" && (
        <Pressable onPress={() => router.push("/coach-apply")} style={{ marginTop: 14 }}>
          <Mono color={C.violet} style={{ fontSize: fs.micro }}>Coach others? Apply to become a verified coach →</Mono>
        </Pressable>
      )}

      {/* Unlock Full — the single upgrade on-ramp for casual users. */}
      {persona === "casual" && (
        <Pressable
          onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "more" }); router.push("/upgrade"); }}
          style={{ marginTop: 16, backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.lime}80`, borderRadius: 22, padding: 18, overflow: "hidden", shadowColor: C.lime, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}
        >
          <View pointerEvents="none" style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, backgroundColor: `${C.lime}24` }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 2, color: txt(C, C.lime) }}>{t("more.upgradeKicker")}</Text>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8, letterSpacing: -0.4 }}>{t("nav.upgrade")}</Text>
          <Mono style={{ marginTop: 5, fontSize: fs.micro, maxWidth: 230 }}>{t("more.upgradeBlurb")}</Mono>
          <View style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>{t("more.goFull")}</Text>
          </View>
        </Pressable>
      )}

      {/* Admin console — operators only. */}
      {role === "admin" && (
        <Pressable onPress={() => router.push("/admin")} style={{ ...cardRow, marginTop: 14, backgroundColor: `${C.amber}14`, borderColor: `${C.amber}80` }}>
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="verified" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>Admin console</Text>
            <Mono style={{ marginTop: 2, fontSize: fs.micro }}>users · moderation · agents · CMS</Mono>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, C.amber) }}>→</Text>
        </Pressable>
      )}

      {/* THE SPRINGBOARD — search + a grid of launcher tiles per cluster. The
          "Everything else" heading is the H1 above; no duplicate kicker here. */}
      <View style={{ marginTop: 20 }}>
        {/* Search — filters the tiles below by label. */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 12 }}>
          <AuroraIcon name="search" size={18} color={C.ash} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${totalTools} tools & screens`}
            placeholderTextColor={C.ash}
            accessibilityLabel="Search tools"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, fontFamily: F.reg, fontSize: fs.note, color: C.chalk, paddingVertical: 0 }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>✕</Text>
            </Pressable>
          )}
        </View>

        {filteredAreas.map(({ group, items }) => {
          const accent = C[GROUP_META[group].ck] as string;
          return (
            <View key={group} style={{ marginTop: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{groupLabel(group)}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{items.length}</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {items.map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => go(it)}
                    accessibilityRole="button"
                    accessibilityLabel={it.locked ? `${it.label} (Full)` : it.label}
                    style={{ width: "25%", alignItems: "center", paddingVertical: 8, paddingHorizontal: 2 }}
                  >
                    <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: `${accent}1c`, borderWidth: 1, borderColor: `${accent}44`, alignItems: "center", justifyContent: "center" }}>
                      <AuroraIcon name={it.icon} size={24} color={it.locked ? C.ash : txt(C, accent)} />
                      {it.locked && (
                        <View style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: 9, backgroundColor: C.lime, borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center" }}>
                          <AuroraIcon name="lock" size={9} color={C.onAccent} />
                        </View>
                      )}
                      {!it.locked && !it.href && (
                        <View style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: 6, backgroundColor: C.blue, borderWidth: 2, borderColor: C.ink }} />
                      )}
                    </View>
                    <Text numberOfLines={2} style={{ marginTop: 6, fontFamily: F.semi, fontSize: fs.micro, lineHeight: 14, color: it.locked ? C.ash : C.chalk, textAlign: "center" }}>{it.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}

        {q.length > 0 && filteredAreas.length === 0 && (
          <Mono style={{ marginTop: 18 }}>No tools match “{query}”.</Mono>
        )}
      </View>

      <Pressable onPress={signOut} style={{ marginTop: 26, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("common.signout")}</Text>
      </Pressable>
    </>
  );

  return aurora ? <AuroraScreen>{body}</AuroraScreen> : <Screen>{body}</Screen>;
}

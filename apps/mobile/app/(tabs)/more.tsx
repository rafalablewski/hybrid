import { useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter, type Href } from "expo-router";
import { groupedNav, navForPersona, FUNNEL, AURORA_NAV_ICONS, type AuroraIconName, type NavGroup } from "@hybrid/core";
import { track } from "../../lib/track";
import { useSession } from "../../lib/session";
import { usePersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { WEB_APP_URL } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, space, Screen, Kicker, Mono, H1, F } from "../../lib/ui";
import { AuroraScreen } from "../../components/aurora/kit";
import { AuroraIcon } from "../../components/aurora/icons";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { useTemplate } from "../../lib/template";

// ── Concept 4 — CATEGORY HUB ────────────────────────────────────────────────
// The old flat springboard listed ~40 destinations in one scroll (unreadable).
// This shows the SEVEN canonical areas as cards; tapping one drills into just
// that area's screens. Same information architecture as the web sidebar
// (groupedNav), so the two clients can't drift — the web shows the groups
// expanded on a desktop rail, mobile drills one at a time. Every feature stays.

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

type HubItem = { id: string; label: string; icon: AuroraIconName; href: Href | null };

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
  const [open, setOpen] = useState<NavGroup | null>(null);

  const navLabel = (id: string, fallback: string) => { const k = "nav." + id; const v = t(k); return v === k ? fallback : v; };
  const groupLabel = (g: NavGroup) => { const k = "nav.group." + g; const v = t(k); return v === k ? GROUP_LABEL[g] : v; };

  // Build the seven areas from the SHARED canonical nav, filtered to this
  // persona + the admin's access override — the exact set the web sidebar shows.
  // groupedNav already drops groups with no items for this persona, but keep an
  // explicit guard so a card (and its items[0] preview) can never render empty.
  const areas: { group: NavGroup; items: HubItem[] }[] = groupedNav(navForPersona(persona, undefined, access))
    .map(({ group, items }) => ({
      group: group as NavGroup,
      items: items.map((i) => ({ id: i.id, label: navLabel(i.id, i.label), icon: AURORA_NAV_ICONS[i.id] ?? "info", href: HREF[i.id] ?? null })),
    }))
    .filter((a) => a.items.length > 0);
  // Onboarding is a re-runnable setup FLOW (not a nav item), so inject it into Train.
  const train = areas.find((a) => a.group === "train");
  if (train && !train.items.some((i) => i.id === "onboarding")) {
    train.items.push({ id: "onboarding", label: navLabel("onboarding", "Get started"), icon: AURORA_NAV_ICONS["onboarding"] ?? "navigation", href: HREF.onboarding });
  }

  const openWeb = () => Linking.openURL(WEB_APP_URL).catch(() => {});
  const go = (it: HubItem) => (it.href ? router.push(it.href) : openWeb());

  // ── DRILL VIEW — one area's screens ──
  const openArea = open ? areas.find((a) => a.group === open) : null;
  if (openArea) {
    const meta = GROUP_META[openArea.group];
    const accent = C[meta.ck] as string;
    const drill = (
      <>
        <Pressable onPress={() => setOpen(null)} hitSlop={10} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>‹ {t("nav.more")}</Text>
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6, marginBottom: 4 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${accent}1c`, borderWidth: 1, borderColor: `${accent}66`, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name={meta.icon} size={22} color={txt(C, accent)} />
          </View>
          <H1>{groupLabel(openArea.group)}</H1>
        </View>
        <View style={{ marginTop: 12 }}>
          {openArea.items.map((it, i) => (
            <Pressable
              key={it.id}
              onPress={() => go(it)}
              style={{ flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 13, paddingHorizontal: 8, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}
            >
              <AuroraIcon name={it.icon} size={20} color={C.chalk} />
              <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{it.label}</Text>
              {!it.href && (
                <View style={{ backgroundColor: `${C.blue}1f`, borderWidth: 1, borderColor: `${C.blue}66`, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, C.blue) }}>WEB</Text>
                </View>
              )}
              <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ash }}>→</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
    return aurora ? <AuroraScreen>{drill}</AuroraScreen> : <Screen>{drill}</Screen>;
  }

  // ── HUB VIEW — identity + the seven area cards ──
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
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 2, color: txt(C, C.lime) }}>UPGRADE</Text>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8, letterSpacing: -0.4 }}>Unlock Full</Text>
          <Mono style={{ marginTop: 5, fontSize: fs.micro, maxWidth: 230 }}>Plans, analytics, your Performance State, the Cockpit &amp; 12+ tools.</Mono>
          <View style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Go Full →</Text>
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

      {/* THE SEVEN AREAS — tap one to drill in. */}
      <View style={{ marginTop: 22 }}>
        <Kicker>Everything else</Kicker>
        <View style={{ marginTop: 10, gap: space.sm }}>
          {areas.map(({ group, items }) => {
            const meta = GROUP_META[group];
            const accent = C[meta.ck] as string;
            const preview = items.slice(0, 3).map((i) => i.label).join(" · ") + (items.length > 3 ? ` · +${items.length - 3}` : "");
            return (
              <Pressable key={group} onPress={() => setOpen(group)} style={cardRow}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: `${accent}1c`, borderWidth: 1, borderColor: `${accent}55`, alignItems: "center", justifyContent: "center" }}>
                  <AuroraIcon name={meta.icon} size={21} color={txt(C, accent)} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{groupLabel(group)}</Text>
                  <Mono style={{ marginTop: 2, fontSize: fs.micro }} numberOfLines={1}>{preview}</Mono>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{items.length} ›</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable onPress={signOut} style={{ marginTop: 26, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("common.signout")}</Text>
      </Pressable>
    </>
  );

  return aurora ? <AuroraScreen>{body}</AuroraScreen> : <Screen>{body}</Screen>;
}

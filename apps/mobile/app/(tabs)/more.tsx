import { useEffect, useState } from "react";
import { View, Text, Pressable, Linking } from "react-native";
import { useRouter, type Href } from "expo-router";
import { navVisibleTo, NAV_ITEMS, FUNNEL, AURORA_NAV_ICONS, type AuroraIconName } from "@hybrid/core";
import { track } from "../../lib/track";
import { useSession } from "../../lib/session";
import { usePersona, useClientPersonaChoice, setClientPersona } from "../../lib/persona";
import { useNavAccess } from "../../lib/access";
import { fetchMyAccessRequests, requestAccess, WEB_APP_URL } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, space, Screen, Kicker, Mono, H1, C, F } from "../../lib/ui";
import { AuroraScreen } from "../../components/aurora/kit";
import { AuroraIcon } from "../../components/aurora/icons";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { useTemplate } from "../../lib/template";

// Springboard glyph for a hub destination — the shared design-kit line icon for
// each nav id (one source of truth, AURORA_NAV_ICONS); falls back to a generic
// info glyph for the handful of non-nav entries (e.g. onboarding).
const navIcon = (id: string): AuroraIconName => AURORA_NAV_ICONS[id] ?? "info";

/** One springboard cell: a rounded-square glyph tile with a label beneath.
 *  Monochrome by design — no per-item accent text (the old rainbow labels are
 *  gone); the only accent in the hub is the single Unlock-Full card. */
function Tile({ icon, label, onPress, palette }: { icon: AuroraIconName; label: string; onPress: () => void; palette: Palette }) {
  return (
    <Pressable onPress={onPress} style={{ width: "25%", alignItems: "center", paddingVertical: 8, gap: space.sm }}>
      <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: palette.ink2, borderWidth: 1, borderColor: palette.line, alignItems: "center", justifyContent: "center" }}>
        <AuroraIcon name={icon} size={24} color={palette.chalk} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.micro, color: palette.chalk, textAlign: "center" }}>{label}</Text>
    </Pressable>
  );
}

// Features worth requesting (everything not casual-by-default).
const GRANTABLE = NAV_ITEMS.filter((i) => i.minPersona && i.minPersona !== "casual");

// Nav ids that have a real mobile screen/route. Anything else the user has
// access to lives on the web app only — keep in sync with the HREF map in
// components/liquid-glass.tsx.
const MOBILE_NAV_IDS = new Set([
  "today", "cockpit", "log", "runtrack", "history", "plans", "periodize", "competition", "sport", "calendar", "builder",
  "performance", "trends", "volume", "exercises", "velocity", "running", "video", "tactical", "forceplate", "progress", "nutrition", "checkin",
  "longevity", "connections", "talent", "coach", "settings", "onboarding",
  "statistics", "timer", "notifications", "profile", "analytics",
  "squad", "teamcompare", "org",
  "feed", "discover", "leaderboard", "coaches",
]);

type Link = { id: string; labelKey: string; sub: string; href: Href; color: string };

const SECTIONS: { titleKey: string; links: Link[] }[] = [
  {
    titleKey: "more.tools",
    links: [
      { id: "log", labelKey: "emptyLog.title", sub: "start from scratch", href: "/workout?source=empty", color: C.lime },
      { id: "statistics", labelKey: "nav.statistics", sub: "week · month · year", href: "/statistics", color: C.lime },
      { id: "timer", labelKey: "nav.timer", sub: "work / rest rounds", href: "/interval-timer", color: C.amber },
      { id: "notifications", labelKey: "nav.notifications", sub: "activity · coach workouts", href: "/notifications", color: C.blue },
    ],
  },
  {
    titleKey: "more.plan",
    links: [
      { id: "builder", labelKey: "nav.builder", sub: "compose a routine", href: "/builder", color: C.lime },
      { id: "plans", labelKey: "nav.plans", sub: "browse & enroll", href: "/(tabs)/plans", color: C.lime },
      { id: "periodize", labelKey: "nav.periodize", sub: "your season · phases", href: "/periodize", color: C.violet },
      { id: "competition", labelKey: "nav.competition", sub: "peak on the day", href: "/competition", color: C.amber },
      { id: "sport", labelKey: "nav.sport", sub: "sport-specific S&C", href: "/(tabs)/sport", color: C.lime },
      { id: "runtrack", labelKey: "nav.runtrack", sub: "time · distance · pace", href: "/run-track", color: C.blue },
      { id: "calendar", labelKey: "nav.calendar", sub: "month view · load heat", href: "/calendar", color: C.blue },
      { id: "onboarding", labelKey: "nav.onboarding", sub: "4 questions → a plan", href: "/onboarding", color: C.violet },
    ],
  },
  {
    titleKey: "more.analyze",
    links: [
      { id: "performance", labelKey: "nav.performance", sub: "HPI · performance state · injury risk", href: "/performance", color: C.blue },
      { id: "analytics", labelKey: "nav.analytics", sub: "dashboards · client/coach/admin", href: "/analytics", color: C.lime },
      { id: "trends", labelKey: "nav.trends", sub: "volume · muscle · exercises", href: "/trends", color: C.lime },
      { id: "volume", labelKey: "nav.volume", sub: "sets/muscle · MEV–MRV", href: "/volume", color: C.lime },
      { id: "exercises", labelKey: "nav.exercises", sub: "per-lift progress · trends", href: "/exercises", color: C.lime },
      { id: "velocity", labelKey: "nav.velocity", sub: "VBT · load–velocity", href: "/(tabs)/velocity", color: C.blue },
      { id: "running", labelKey: "nav.running", sub: "mileage · pace · easy/hard", href: "/(tabs)/running", color: C.blue },
      { id: "video", labelKey: "nav.video", sub: "technique · asymmetry", href: "/video", color: C.violet },
      { id: "tactical", labelKey: "nav.tactical", sub: "deployment readiness", href: "/tactical", color: C.amber },
      { id: "forceplate", labelKey: "nav.forceplate", sub: "import jump CSV", href: "/forceplate", color: C.blue },
      { id: "progress", labelKey: "nav.progress", sub: "body recomposition", href: "/progress", color: C.violet },
    ],
  },
  {
    titleKey: "more.social",
    links: [
      { id: "feed", labelKey: "nav.feed", sub: "friends' workouts & PRs", href: "/feed", color: C.lime },
      { id: "discover", labelKey: "nav.discover", sub: "search · follow", href: "/discover", color: C.blue },
      { id: "leaderboard", labelKey: "nav.leaderboard", sub: "weekly · friends", href: "/leaderboard", color: C.amber },
      { id: "coaches", labelKey: "nav.coaches", sub: "marketplace · start a program", href: "/coaches", color: C.violet },
    ],
  },
  {
    titleKey: "more.routines",
    links: [
      { id: "nutrition", labelKey: "nav.nutrition", sub: "macros · adaptive targets", href: "/nutrition", color: C.lime },
      { id: "checkin", labelKey: "nav.checkin", sub: "weekly review · coach reply", href: "/checkin", color: C.blue },
      { id: "longevity", labelKey: "nav.longevity", sub: "biological age · healthspan", href: "/longevity", color: C.violet },
      { id: "connections", labelKey: "nav.connections", sub: "wearables · sensors", href: "/connections", color: C.blue },
      { id: "talent", labelKey: "nav.talent", sub: "benchmarks · discovery", href: "/talent", color: C.violet },
      { id: "coach", labelKey: "nav.coach", sub: "roster · notes · clients", href: "/(tabs)/coach", color: C.violet },
      { id: "squad", labelKey: "nav.squad", sub: "RAG readiness · ACWR · risk", href: "/squad", color: C.amber },
      { id: "teamcompare", labelKey: "nav.teamcompare", sub: "athletes side by side", href: "/teamcompare", color: C.blue },
      { id: "org", labelKey: "nav.org", sub: "teams · staff · access", href: "/org", color: C.lime },
    ],
  },
];

export default function More() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  // Aurora softens every surface — match the rest of the app (cards → bigger
  // radius, CTAs → pills) so the More hub isn't a classic island in Aurora.
  const aurora = useTemplate().template === "aurora";
  const rCard = aurora ? 22 : 14;
  const { signOut, role, entitlement, name } = useSession();
  const initials = ((name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!).join("") || "·").toUpperCase();
  const persona = usePersona();
  const choice = useClientPersonaChoice();
  const access = useNavAccess();
  const [reqStatus, setReqStatus] = useState<Record<string, string>>({});
  useEffect(() => {
    fetchMyAccessRequests().then((rs) => {
      const m: Record<string, string> = {};
      for (const r of rs) m[r.navId] = r.status;
      setReqStatus(m);
    });
  }, []);
  const askAccess = (navId: string) => {
    setReqStatus((s) => ({ ...s, [navId]: "pending" }));
    void requestAccess(navId);
  };
  // Features the user can't currently see — offer to request them.
  const hidden = GRANTABLE.filter((i) => !navVisibleTo(persona, i.id, access));
  // Features the user HAS access to but that only exist on the web app — surface
  // them so the access isn't silently invisible on mobile.
  const webOnly = NAV_ITEMS.filter((i) => navVisibleTo(persona, i.id, access) && !MOBILE_NAV_IDS.has(i.id));

  // Shape the hub to the persona (honouring the admin's access override): a
  // casual retail user sees only the lean set, an athlete/coach sees the depth.
  // Sections with nothing visible drop out.
  // `onboarding` is the universal setup flow — it's no longer a nav item (so
  // navVisibleTo can't gate it), but every persona can re-run it, so it always
  // shows. Everything else is persona/access gated as before.
  // `onboarding` is the universal setup flow (no longer a nav item), so it always
  // shows and bypasses the persona filter. (`builder` is a free, ungated nav item
  // now — navVisibleTo lets it through for every persona, so it needs no bypass.)
  const ALWAYS = new Set(["onboarding"]);
  const sections = SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => ALWAYS.has(l.id) || navVisibleTo(persona, l.id, access)),
  })).filter((s) => s.links.length > 0);

  // Aurora wraps the hub in the airy AuroraScreen (blob field + nav clearance);
  // classic keeps the glass Screen. Same content either way.
  const body = (
    <>
      <Kicker>{t("nav.more")}</Kicker>
      <H1>{t("more.title")}</H1>
      <Mono style={{ marginTop: 6 }}>{t("more.intro")}</Mono>

      {/* PROFILE (You) — pinned at the TOP. Profile left the bottom bar (it's in
          the Today header now), so the hub carries the global way in: the Today
          header avatar only shows on Today, but the bar — and this hub — are on
          every screen. */}
      <Pressable
        onPress={() => router.push("/(tabs)/you")}
        style={{ marginTop: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: rCard, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: `${C.lime}22`, borderWidth: 1, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: txt(C, C.lime) }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{name || t("nav.you")}</Text>
          <Mono style={{ marginTop: 3, fontSize: fs.micro }}>{role === "coach" ? t("w.account.profile.role-coach") : t("w.account.profile.role-athlete")}</Mono>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.ash }}>→</Text>
      </Pressable>

      {/* SETTINGS — pinned to the TOP of the hub. The bottom-nav glyph is a cog,
          so users tap "More" expecting Settings; lead with it (and the account
          summary) so that expectation is met immediately, and it's no longer
          buried at the very bottom where the floating nav covered it. */}
      <Pressable
        onPress={() => router.push("/settings")}
        style={{ marginTop: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: rCard, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
      >
        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="settings" size={20} color={C.chalk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{t("settings.title")}</Text>
          <Mono style={{ marginTop: 3, fontSize: fs.micro }}>
            {[role.toUpperCase(), entitlement === "paid" ? "FULL · PAID" : "FREE"].join(" · ")} — {t("settings.sub")}
          </Mono>
        </View>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.ash }}>→</Text>
      </Pressable>

      {/* ADMIN CONSOLE — operators only. Parity with the web sidebar's pinned
          "Admin console" button; opens the mobile /admin surface. The route is
          additionally gated server-side on every /api/admin call. */}
      {role === "admin" && (
        <Pressable
          onPress={() => router.push("/admin")}
          style={{ marginTop: 14, backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}80`, borderRadius: rCard, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="verified" size={20} color={C.amber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>Admin console</Text>
            <Mono style={{ marginTop: 2, fontSize: fs.micro }}>users · moderation · agents · CMS · governance</Mono>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: txt(C, C.amber) }}>→</Text>
        </Pressable>
      )}

      {/* Mode toggle — a client picks the lean tracker (Simple, free) or the
          full athlete toolkit (Full, a paid upgrade). Coaches/admins get their
          surface from their role; Coach is no longer a self-serve mode. */}
      {role === "client" && (
        <View style={{ marginTop: 16 }}>
          <Kicker>Mode</Kicker>
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
            {([
              { id: "casual" as const, label: "Simple", sub: "track · share", paid: false },
              { id: "athlete" as const, label: "Full", sub: "plans · stats", paid: true },
            ]).map((m) => {
              const active = (choice ?? "casual") === m.id;
              const locked = m.paid && entitlement !== "paid";
              return (
                <Pressable
                  key={m.id}
                  // Full is gated: without a paid entitlement, tapping it opens
                  // the upgrade screen instead of switching mode.
                  onPress={() => (locked ? router.push("/upgrade") : setClientPersona(m.id))}
                  style={{ flex: 1, backgroundColor: active ? `${C.lime}1a` : C.card, borderWidth: 1, borderColor: active ? C.lime : C.line, borderRadius: 12, padding: 12 }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: active ? txt(C, C.lime) : C.chalk }}>
                    {m.label}{locked ? " 🔒" : ""}
                  </Text>
                  <Mono style={{ marginTop: 2, fontSize: fs.nano }}>{locked ? "paid upgrade" : m.sub}</Mono>
                </Pressable>
              );
            })}
          </View>
          {/* Coach is verification-gated now — apply, an admin reviews. */}
          <Pressable onPress={() => router.push("/coach-apply")} style={{ marginTop: 10 }}>
            <Mono color={C.violet} style={{ fontSize: fs.micro }}>Coach others? Apply to become a verified coach →</Mono>
          </Pressable>
        </View>
      )}

      {/* UNLOCK FULL — the single upgrade on-ramp for casual users (parity with
          the web sidebar's pinned entry); no scattered locks elsewhere. */}
      {persona === "casual" && (
        <Pressable
          onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "more" }); router.push("/upgrade"); }}
          style={{ marginTop: 18, backgroundColor: C.ink2, borderWidth: 1, borderColor: `${C.lime}80`, borderRadius: 22, padding: 18, overflow: "hidden", shadowColor: C.lime, shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}
        >
          {/* Premium 'membership card' sheen — RN has no gradient, so a soft
              low-opacity lime disc in the corner gives the glow. */}
          <View pointerEvents="none" style={{ position: "absolute", top: -54, right: -44, width: 168, height: 168, borderRadius: 84, backgroundColor: `${C.lime}24` }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 2, color: txt(C, C.lime) }}>UPGRADE</Text>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8, letterSpacing: -0.4 }}>Unlock Full</Text>
          <Mono style={{ marginTop: 5, fontSize: fs.micro, maxWidth: 230 }}>Plans, analytics, your Performance State, the Cockpit &amp; 12+ tools.</Mono>
          <View style={{ marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", backgroundColor: C.lime, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Go Full →</Text>
          </View>
        </Pressable>
      )}

      {/* Athlete cockpit — the organized depth hub (persona/access gated) */}
      {navVisibleTo(persona, "cockpit", access) && (
        <Pressable
          onPress={() => router.push("/(tabs)/cockpit")}
          style={{ marginTop: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: rCard, padding: 16, flexDirection: "row", alignItems: "center", gap: 14 }}
        >
          <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <AuroraIcon name="user-circle" size={20} color={C.chalk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>Athlete cockpit</Text>
            <Mono style={{ marginTop: 2, fontSize: fs.micro }}>goal · season · performance · sport · velocity</Mono>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.ash }}>→</Text>
        </Pressable>
      )}

      {sections.map((section) => (
        <View key={section.titleKey} style={{ marginTop: 20 }}>
          <Kicker>{t(section.titleKey)}</Kicker>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
            {section.links.map((l) => (
              <Tile key={l.labelKey} icon={navIcon(l.id)} label={t(l.labelKey)} onPress={() => router.push(l.href)} palette={C} />
            ))}
          </View>
        </View>
      ))}

      {/* More in the web app — features the user has access to that live on web only */}
      {webOnly.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <Kicker>More in the web app</Kicker>
          <Mono style={{ marginTop: 4, fontSize: fs.micro }}>
            You have access to these — they live in the HYBRID web app for now.
          </Mono>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
            {webOnly.map((item) => (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{item.icon} {item.label}</Text>
              </View>
            ))}
          </View>
          <Pressable
            onPress={() => Linking.openURL(WEB_APP_URL).catch(() => {})}
            style={{ marginTop: 12, backgroundColor: `${C.blue}1f`, borderWidth: 1, borderColor: C.blue, borderRadius: 12, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: txt(C, C.blue) }}>Open the web app →</Text>
          </Pressable>
        </View>
      )}

      {/* Request a feature — ask an admin to unlock something beyond your persona */}
      {hidden.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <Kicker>Request a feature</Kicker>
          <Mono style={{ marginTop: 4, fontSize: fs.micro }}>Want a tool you don&apos;t see? Ask an admin to unlock it.</Mono>
          <View style={{ marginTop: 10, gap: space.sm }}>
            {hidden.map((item) => {
              const pending = reqStatus[item.id] === "pending";
              return (
                <View key={item.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{item.icon} {item.label}</Text>
                  {pending ? (
                    <Mono style={{ fontSize: fs.micro }} color={C.ash}>requested · pending</Mono>
                  ) : (
                    <Pressable onPress={() => askAccess(item.id)} style={{ backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 6 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, C.lime) }}>Request</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}

      <Pressable onPress={signOut} style={{ marginTop: 24, alignItems: "center" }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("common.signout")}</Text>
      </Pressable>
    </>
  );

  return aurora ? <AuroraScreen>{body}</AuroraScreen> : <Screen>{body}</Screen>;
}

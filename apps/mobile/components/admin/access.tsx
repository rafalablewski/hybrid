import { useCallback, useEffect, useState } from "react";
import { View, Text } from "react-native";
import {
  groupedNav,
  sanitizePersonaAccess,
  AURORA_NAV_ICONS,
  type NavGroup,
  type Persona,
  type PersonaAccess,
} from "@hybrid/core";
import { adminGet, adminSend } from "../../lib/admin-api";
import { leading, fs, space, Mono, Kicker, Chip, LoadSwap, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { AuroraIcon } from "../aurora/icons";
import { Intro, Banner, ErrorNote, PillBtn, FilterGroup } from "./_kit";
import { ACard, cardStack } from "../aurora/kit";
import { useConfirm } from "../aurora/confirm";

// Mobile Access (Governance) — parity with the web "access" section, which
// renders <CoachApplications/> then <AdminAccess/>. Combined here into ONE body
// with three tabs:
//   • Queues   — pending coach applications (Approve/Deny).
//   • Roles    — the read-only RBAC reference (3 roles + permission matrix).
//   • Personas — the per-nav-item minimum-persona editor (writes access.personaNav).
// Same endpoints + shapes as web; mutations are optimistic with resync/rollback.

// ---- static RBAC reference model (mirrors web access.tsx) ----
const ROLE_MODEL: [string, "lime" | "violet" | "amber", string][] = [
  ["Client", "lime", "Owns their own data. Sees only themselves. Private coach notes stay hidden."],
  ["Coach", "violet", "Sees only athletes who accepted them (mutual consent). Can leave private notes. Also a client."],
  ["Admin", "amber", "Platform aggregates & content. No silent access to private training data; support access is audited."],
];

const ROLE_PERMISSIONS = [
  { cap: "Own training data & analytics", client: "full", coach: "own", admin: "no" },
  { cap: "Other athletes' data", client: "no", coach: "consented only", admin: "aggregate" },
  { cap: "Leave coaching notes", client: "no", coach: "yes (+private)", admin: "no" },
  { cap: "Private coach notes visible", client: "no", coach: "own", admin: "no" },
  { cap: "Adjust someone's plan", client: "no", coach: "consented only", admin: "no" },
  { cap: "Platform metrics (MAU, retention)", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage content & languages", client: "no", coach: "no", admin: "yes" },
  { cap: "Manage accounts & verify coaches", client: "no", coach: "no", admin: "yes" },
];

const PERSONAS: Persona[] = ["casual", "athlete", "coach", "admin"];
const PERSONA_LABEL: Record<Persona, string> = { casual: "Casual", athlete: "Athlete", coach: "Coach", admin: "Admin" };
const GROUP_LABEL: Record<NavGroup, string> = {
  home: "Home", train: "Train", analyze: "Analyze", recovery: "Recovery", social: "Social", teams: "Teams", account: "Account",
};
const FLAG_KEY = "access.personaNav";

// ---- API shapes (match the web components / routes) ----
type CoachApp = { id: string; userEmail: string; credentials: string; status: string; createdAt: string };
type FlagRow = { key: string; value: unknown };
type Tab = "queues" | "roles" | "personas";

export default function AdminAccess() {
  const { confirm } = useConfirm();
  const { palette } = useTheme();
  const [tab, setTab] = useState<Tab>("queues");

  // queues
  const [apps, setApps] = useState<CoachApp[]>([]);

  // persona editor
  const [overrides, setOverrides] = useState<PersonaAccess>({});
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const groups = groupedNav();

  const load = useCallback(async () => {
    const [appRes, flagRes] = await Promise.all([
      adminGet<{ applications?: CoachApp[] }>("/api/admin/coach-applications"),
      adminGet<{ flags?: FlagRow[]; unavailable?: boolean }>("/api/admin/flags"),
    ]);
    setApps((appRes.data?.applications ?? []).filter((a) => a.status === "pending"));
    setUnavailable(Boolean(flagRes.data?.unavailable));
    setOverrides(sanitizePersonaAccess(flagRes.data?.flags?.find((f) => f.key === FLAG_KEY)?.value));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- coach application decision (optimistic + resync on failure) ---
  const decideApp = async (id: string, action: "approve" | "deny") => {
    const run = async () => {
      setApps((a) => a.filter((x) => x.id !== id));
      const res = await adminSend("PATCH", `/api/admin/coach-applications/${id}`, { action });
      if (!res.ok) load();
    };
    if (action === "deny") {
      if (await confirm({ title: "Deny application?", message: "The applicant won't be promoted to coach.", confirmLabel: "Deny", destructive: true })) run();
    } else run();
  };

  // --- persona override (optimistic with rollback, writes the flag) ---
  const change = async (id: string, def: Persona, chosen: Persona) => {
    const prev = { ...overrides };
    const next: PersonaAccess = { ...overrides };
    if (chosen === def) delete next[id];
    else next[id] = chosen;
    setOverrides(next);
    setBusy(true);
    setErr(null);
    const res = await adminSend("POST", "/api/admin/flags", { key: FLAG_KEY, value: next });
    if (!res.ok) {
      setOverrides(prev);
      setErr("Couldn't save that access change — reverted.");
    }
    setBusy(false);
  };

  return (
    <LoadSwap loading={loading}>
      {() => {
        if (loading) return null;
        const pendingCount = apps.length;
        const overrideCount = Object.keys(overrides).length;

        return (
          <View>
            <FilterGroup<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: "queues", label: pendingCount > 0 ? `Queues – ${pendingCount}` : "Queues" },
                { value: "roles", label: "Roles (RBAC)" },
                { value: "personas", label: "Personas" },
              ]}
            />

            {tab === "queues" && (
              <View>
                <Intro>
                  Approve or deny pending coach applications — approving promotes a client to the verified
                  COACH role.
                </Intro>

                {/* Coach applications */}
                <ACard accent={palette.violet} style={cardStack}>
                  <Kicker color={palette.violet}>Pending coach applications – {apps.length}</Kicker>
                  <View style={{ marginTop: 10 }}>
                    {apps.length === 0 ? (
                      <Mono style={{ fontSize: fs.body }}>No pending applications.</Mono>
                    ) : (
                      apps.map((a) => (
                        <View key={a.id} style={{ borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 10 }}>
                          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: palette.chalk }}>{a.userEmail}</Text>
                          <Mono color={palette.chalk} style={{ fontSize: fs.caption, marginTop: 4, lineHeight: leading(fs.caption) }}>{a.credentials}</Mono>
                          <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 4 }}>
                            {new Date(a.createdAt).toLocaleDateString()}
                          </Mono>
                          <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
                            <PillBtn label="Approve" color={palette.lime} onPress={() => decideApp(a.id, "approve")} />
                            <PillBtn label="Deny" color={palette.ash} outline onPress={() => decideApp(a.id, "deny")} />
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </ACard>
              </View>
            )}

            {tab === "roles" && (
              <View>
                <Intro>
                  Three roles, each scoped. Access is enforced server-side by relationship, not the role
                  label alone.
                </Intro>
                {ROLE_MODEL.map(([name, key, desc]) => {
                  const c = palette[key];
                  return (
                    <ACard key={name} accent={c} style={cardStack}>
                      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(palette, c) }}>{name}</Text>
                      <Mono color={palette.chalk} style={{ fontSize: fs.caption, marginTop: 6, lineHeight: leading(fs.caption) }}>{desc}</Mono>
                    </ACard>
                  );
                })}
                <ACard style={cardStack}>
                  <Kicker>Permission matrix</Kicker>
                  <View style={{ marginTop: 12 }}>
                    {/* header */}
                    <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: palette.line, paddingBottom: 6 }}>
                      <Mono color={palette.ash} style={{ flex: 2, fontSize: fs.micro }}>CAP</Mono>
                      <Mono color={palette.lime} style={{ flex: 1, fontSize: fs.micro, textAlign: "center" }}>CLIENT</Mono>
                      <Mono color={palette.violet} style={{ flex: 1, fontSize: fs.micro, textAlign: "center" }}>COACH</Mono>
                      <Mono color={palette.amber} style={{ flex: 1, fontSize: fs.micro, textAlign: "center" }}>ADMIN</Mono>
                    </View>
                    {ROLE_PERMISSIONS.map((p) => (
                      <View key={p.cap} style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 8 }}>
                        <Text style={{ flex: 2, fontFamily: F.semi, fontSize: fs.caption, color: palette.chalk, paddingRight: 6 }}>{p.cap}</Text>
                        <PermCell v={p.client} />
                        <PermCell v={p.coach} />
                        <PermCell v={p.admin} />
                      </View>
                    ))}
                  </View>
                </ACard>
              </View>
            )}

            {tab === "personas" && (
              <View>
                {unavailable && (
                  <Banner title="Overrides not persisted yet">
                    The FeatureFlag table doesn&apos;t exist yet — run reference/sql-feature-flags.sql in
                    Supabase to make these persist. Until then the app runs on the code defaults below.
                  </Banner>
                )}
                <Intro>
                  Set the minimum persona for each feature. Personas nest (Casual ⊂ Athlete ⊂ Coach ⊂
                  Admin), so lowering a feature exposes it to more users. Changes take effect on the next
                  client load — no deploy.{busy ? " – saving…" : ""}
                </Intro>
                <Mono color={palette.ash} style={{ marginBottom: 16, fontSize: fs.micro }}>
                  {overrideCount} override{overrideCount === 1 ? "" : "s"} active.
                </Mono>
                <ErrorNote error={err} onDismiss={() => setErr(null)} />

                {groups.map(({ group, items }) => (
                  <ACard key={group} style={cardStack}>
                    <Kicker color={palette.violet}>{GROUP_LABEL[group]}</Kicker>
                    <View style={{ marginTop: 10 }}>
                      {items.map((item) => {
                        const def: Persona = item.minPersona ?? "casual";
                        const current = overrides[item.id] ?? def;
                        const overridden = overrides[item.id] !== undefined;
                        return (
                          <View key={item.id} style={{ borderBottomWidth: 1, borderBottomColor: palette.line, paddingVertical: 10 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                              <AuroraIcon name={AURORA_NAV_ICONS[item.id] ?? "info"} size={18} color={palette.chalk} />
                              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: palette.chalk }}>
                                {item.label}
                              </Text>
                              {overridden && <Chip color={palette.amber}>overridden</Chip>}
                            </View>
                            <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 2 }}>
                              {item.id} – default: {PERSONA_LABEL[def]}
                            </Mono>
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: 8 }}>
                              {PERSONAS.map((p) => {
                                const on = p === current;
                                return (
                                  <Pressable
                                    key={p}
                                    disabled={busy}
                                    onPress={() => change(item.id, def, p)}
                                    style={{
                                      borderWidth: 1,
                                      borderColor: on ? palette.lime : palette.line,
                                      backgroundColor: on ? `${palette.lime}1c` : "transparent",
                                      borderRadius: 999,
                                      paddingVertical: 5,
                                      paddingHorizontal: 11,
                                      opacity: busy ? 0.6 : 1,
                                    }}
                                  >
                                    <Text style={{ fontFamily: F.semi, fontSize: fs.micro, color: on ? txt(palette, palette.lime) : palette.ash }}>
                                      {PERSONA_LABEL[p]}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ACard>
                ))}
              </View>
            )}
          </View>
        );
      }}
    </LoadSwap>
  );
}

function PermCell({ v }: { v: string }) {
  const { palette } = useTheme();
  const yes = v === "full" || v === "yes" || v === "yes (+private)";
  const no = v === "no";
  const color = no ? palette.ash : yes ? palette.lime : palette.amber;
  return (
    <Mono color={color} style={{ flex: 1, fontSize: fs.micro, textAlign: "center" }}>
      {no ? "—" : v}
    </Mono>
  );
}

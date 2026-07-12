import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import {
  CAPABILITIES,
  capabilitiesByStatus,
  K_ANON,
  METRIC_LABEL,
  type Capability,
  type CapabilityStatus,
  type BenchmarkMetric,
} from "@hybrid/core";
import { adminGet } from "../../lib/admin-api";
import { fs, space, Card, Mono, Kicker, Chip, Loading, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Segmented, Stat, ErrorNote } from "./_kit";

// Mobile Capabilities & data — parity with apps/web/components/admin/content.tsx
// (which tabs CapabilitiesScreen ⇄ DataNet). Capabilities come from @hybrid/core
// grouped by status; the Data network summary is a compact read of GET /api/datanet
// (web shows a full cohort-norms table + refit/snapshot controls — here we keep the
// DATA as Stat tiles + a calibration readout + a few norm rows; mutations omitted).

type Tab = "capabilities" | "datanet";

export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("capabilities");
  return (
    <View>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "capabilities", label: "Capabilities" },
          { value: "datanet", label: "Data network" },
        ]}
      />
      {tab === "capabilities" ? <Capabilities /> : <DataNet />}
    </View>
  );
}

// ---------------------------------------------------------------------------

function Capabilities() {
  const { palette } = useTheme();
  const order: CapabilityStatus[] = ["shipped", "blocked", "planned"];
  const meta: Record<CapabilityStatus, { label: string; color: string; blurb: string }> = {
    shipped: { label: "Shipped", color: palette.lime, blurb: "Built and working." },
    blocked: { label: "Blocked", color: palette.amber, blurb: "Implemented, stuck on missing data / access." },
    planned: { label: "Planned", color: palette.ash, blurb: "Not built yet." },
  };

  return (
    <View>
      <Mono color={palette.ash} style={{ fontSize: fs.body, marginBottom: 14 }}>
        Living registry of every capability — kept current as features ship, block, or get planned.
      </Mono>

      <View style={{ flexDirection: "row", gap: space.md }}>
        {order.map((st) => (
          <View key={st} style={{ flex: 1 }}>
            <Stat label={meta[st].label} value={capabilitiesByStatus(st).length} color={meta[st].color} />
          </View>
        ))}
      </View>

      {order.map((st) => {
        const items = capabilitiesByStatus(st);
        if (items.length === 0) return null;
        return (
          <View key={st} style={{ marginTop: 6 }}>
            <Kicker color={meta[st].color}>{meta[st].label} – {items.length}</Kicker>
            <View style={{ marginTop: 8 }}>
              {items.map((c) => (
                <CapRow key={c.id} cap={c} color={meta[st].color} />
              ))}
            </View>
          </View>
        );
      })}

      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 14 }}>
        Source: packages/core/src/capabilities.ts – {CAPABILITIES.length} capabilities tracked.
      </Mono>
    </View>
  );
}

function CapRow({ cap, color }: { cap: Capability; color: string }) {
  const { palette } = useTheme();
  return (
    <Card accent={color}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.ms }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: palette.chalk, flex: 1 }}>{cap.title}</Text>
        <Chip color={palette.ash}>{cap.area}</Chip>
      </View>
      <Mono color={palette.chalk} style={{ fontSize: 12.5, lineHeight: 19, marginTop: 6 }}>{cap.detail}</Mono>
      {cap.blockedBy ? (
        <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: `${palette.amber}12`, borderWidth: 1, borderColor: `${palette.amber}40` }}>
          <Kicker color={palette.amber}>Needs</Kicker>
          <Mono color={palette.chalk} style={{ fontSize: fs.caption, lineHeight: 18, marginTop: 3 }}>{cap.blockedBy}</Mono>
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

type Norm = { cohortKey: string; sport: string; sex: string; ageBand: string; metric: BenchmarkMetric; n: number; mean: number; sd: number; p10: number; p50: number; p90: number };
type DStats = { observations: number; athletes: number; cohorts: number; releasableCohorts: number };
type Calibration = { version: string; n: number; outcomes: number; positives: number; negatives: number; coeffs: { intercept: number; slope: number } };
type DataNetResp = { stats: DStats; norms: Norm[]; calibration: Calibration };

function DataNet() {
  const { palette } = useTheme();
  const [d, setD] = useState<DataNetResp | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    adminGet<DataNetResp>("/api/datanet").then((r) => {
      if (r.ok && r.data) setD(r.data);
      else setErr(true);
    });
  }, []);

  if (err) return <ErrorNote error="Failed to load the data network." />;
  if (!d) return <Loading />;

  return (
    <View>
      <Card accent={palette.violet}>
        <Kicker color={palette.violet}>Data network – benchmarking intelligence</Kicker>
        <Mono color={palette.chalk} style={{ fontSize: fs.body, lineHeight: 19, marginTop: 6 }}>
          The flywheel: every consented athlete sharpens the cohort norms and (with labeled outcomes) the injury
          calibration. De-identified — only cohorts with ≥ {K_ANON} athletes are released.
        </Mono>
      </Card>

      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}><Stat label="Athletes" value={d.stats.athletes} color={palette.lime} /></View>
        <View style={{ flex: 1 }}><Stat label="Observations" value={d.stats.observations} color={palette.blue} /></View>
      </View>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}><Stat label="Cohorts" value={d.stats.cohorts} /></View>
        <View style={{ flex: 1 }}><Stat label={`Releasable (≥${K_ANON})`} value={d.stats.releasableCohorts} color={palette.violet} /></View>
      </View>

      <Card accent={d.calibration.n > 0 ? palette.lime : palette.ash}>
        <Kicker color={palette.blue}>Injury calibration</Kicker>
        <Mono color={palette.chalk} style={{ fontSize: fs.body, marginTop: 4 }}>
          model {d.calibration.version} – {d.calibration.n > 0 ? `refit on ${d.calibration.n} outcomes` : "synthetic prior"}
        </Mono>
        <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 2, lineHeight: 16 }}>
          labels: {d.calibration.positives} injured – {d.calibration.negatives} healthy – σ(a + b·score): a=
          {d.calibration.coeffs.intercept.toFixed(2)}, b={d.calibration.coeffs.slope.toFixed(2)}
        </Mono>
      </Card>

      <Card>
        <Kicker>Cohort norms (released)</Kicker>
        {d.norms.length === 0 ? (
          <Mono color={palette.ash} style={{ fontSize: fs.body, marginTop: 10, lineHeight: 19 }}>
            No cohort has reached {K_ANON} consented athletes yet — aggregates are suppressed until then.
          </Mono>
        ) : (
          <View style={{ marginTop: 10 }}>
            {d.norms.map((nrm) => (
              <View key={nrm.cohortKey} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                  <Mono color={palette.chalk} style={{ fontSize: fs.caption, flex: 1 }}>{nrm.sport} – {nrm.sex} – {nrm.ageBand}</Mono>
                  <Chip color={palette.blue}>{METRIC_LABEL[nrm.metric]}</Chip>
                </View>
                <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 4 }}>
                  n={nrm.n} – mean {nrm.mean} – sd {nrm.sd} – P10 {nrm.p10} – P50 {nrm.p50} – P90 {nrm.p90}
                </Mono>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}

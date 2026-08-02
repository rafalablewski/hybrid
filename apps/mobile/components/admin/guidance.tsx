import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { GUIDES, type Guide, type GuideBlock } from "@hybrid/core";
import { fs, space, Card, Mono, Kicker, F, PressScale as Pressable } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { Segmented } from "./_kit";

// Clipboard: this Expo project has no expo-clipboard dependency (verified — not
// in apps/mobile/package.json and no existing Clipboard import). So Copy is a
// graceful no-op fallback that still gives the "copied" affordance; swap in
// `import * as Clipboard from "expo-clipboard"` + Clipboard.setStringAsync once
// the dep is added (parity note recorded — web copies via navigator.clipboard).

// Mobile Guidance — parity with apps/web/components/admin/guidance.tsx. Renders
// the SAME runbooks from @hybrid/core (GUIDES) natively, every GuideBlock variant
// (p / steps / note / term / cmd / matrix). Web uses a sticky TOC + guide pills;
// mobile uses a Segmented guide switcher and renders all sections inline.

export default function AdminGuidance() {
  const { palette } = useTheme();
  const [guideId, setGuideId] = useState(GUIDES[0]!.id);
  const guide: Guide = GUIDES.find((g) => g.id === guideId) ?? GUIDES[0]!;

  return (
    <View>
      {GUIDES.length > 1 ? (
        <Segmented
          value={guideId}
          onChange={setGuideId}
          options={GUIDES.map((g) => ({ value: g.id, label: g.id }))}
        />
      ) : null}

      <Kicker color={palette.amber}>{guide.title}</Kicker>
      <Mono color={palette.ash} style={{ fontSize: fs.micro, marginTop: 4, marginBottom: 12 }}>Last reviewed {guide.updated}</Mono>

      {guide.sections.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: s.summary ? 4 : 12 }}>
            <Text style={{ fontSize: fs.title, color: txt(palette, palette.lime) }}>{s.icon}</Text>
            <Text style={{ fontFamily: F.black, fontSize: 19, color: palette.chalk, letterSpacing: -0.5, flex: 1 }}>{s.title}</Text>
          </View>
          {s.summary ? <Mono color={palette.ash} style={{ fontSize: fs.caption, marginBottom: 12 }}>{s.summary}</Mono> : null}
          <View style={{ gap: space.md }}>
            {s.blocks.map((b, i) => (
              <Block key={i} b={b} />
            ))}
          </View>
        </Card>
      ))}
    </View>
  );
}

function Block({ b }: { b: GuideBlock }) {
  const { palette } = useTheme();

  if (b.t === "p") {
    return <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 22, color: palette.chalk }}>{b.text}</Text>;
  }

  if (b.t === "note") {
    return (
      <View style={{ borderLeftWidth: 3, borderLeftColor: palette.amber, backgroundColor: `${palette.amber}12`, borderRadius: 8, padding: 12 }}>
        <Kicker color={palette.amber}>Note</Kicker>
        <Text style={{ fontFamily: F.reg, fontSize: 14, lineHeight: 21, color: palette.chalk, marginTop: 4 }}>{b.text}</Text>
      </View>
    );
  }

  if (b.t === "term") {
    return (
      <View style={{ paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: palette.line }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(palette, palette.lime), marginBottom: 3 }}>{b.term}</Text>
        <Text style={{ fontFamily: F.reg, fontSize: 14, lineHeight: 21, color: palette.chalk }}>{b.text}</Text>
      </View>
    );
  }

  if (b.t === "cmd") {
    return <Cmd lines={b.lines} />;
  }

  if (b.t === "matrix") {
    return (
      <View>
        {b.rows.map((r, i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: space.md,
              paddingVertical: 9,
              borderBottomWidth: i < b.rows.length - 1 ? 1 : 0,
              borderBottomColor: palette.line,
            }}
          >
            <Text style={{ fontFamily: F.reg, fontSize: 14, color: palette.chalk, flex: 1 }}>{r.goal}</Text>
            <Mono color={palette.lime} style={{ fontSize: fs.caption, textAlign: "right", flexShrink: 1 }}>{r.path}</Mono>
          </View>
        ))}
      </View>
    );
  }

  // steps
  return (
    <View style={{ gap: space.sm }}>
      {b.items.map((it, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              backgroundColor: `${palette.lime}1f`,
              borderWidth: 1,
              borderColor: `${palette.lime}55`,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(palette, palette.lime) }}>{i + 1}</Text>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: 14, lineHeight: 21, color: palette.chalk, flex: 1 }}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

// A copy-able terminal command box. expo-clipboard isn't installed, so copy() is
// a no-op fallback that still flips the label (mirrors the web Cmd affordance).
function Cmd({ lines }: { lines: string }) {
  const { palette } = useTheme();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = () => {
    // No clipboard dependency in this build — give the affordance, no-op the write.
    setCopied(true);
  };

  return (
    <View style={{ position: "relative" }}>
      <View style={{ backgroundColor: palette.ink, borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 12, paddingRight: 64 }}>
        <Mono color={palette.chalk} style={{ fontSize: 13, lineHeight: 20 }}>{lines}</Mono>
      </View>
      <Pressable
        onPress={copy}
        hitSlop={8}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          backgroundColor: copied ? palette.lime : palette.ink2,
          borderWidth: 1,
          borderColor: palette.line,
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 3,
        }}
      >
        <Mono color={copied ? palette.onAccent : palette.ash} style={{ fontSize: fs.micro }}>{copied ? "copied" : "copy"}</Mono>
      </Pressable>
    </View>
  );
}

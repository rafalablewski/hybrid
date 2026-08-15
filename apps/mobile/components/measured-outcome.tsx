import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { efficacyLine, type ProgramEfficacy } from "@hybrid/core";
import { fetchEfficacyCard } from "../lib/api";
import { useTheme, txt } from "../lib/theme";
import { leading, tracking, fs, F } from "../lib/ui";
import { ACard } from "./aurora/kit";

/** The Program Efficacy Index's read on THIS plan — what it measurably
 *  produced for the athletes who ran it, or an honest "not yet measured".
 *  Mirrored by the web plan detail's MeasuredOutcome (aurora/plans.tsx); the
 *  copy comes from core (`efficacyLine`) so both clients print the identical
 *  sentence, fed by the same public /api/efficacy dataset. */
export default function MeasuredOutcome({ planId }: { planId: string }) {
  const { palette: C } = useTheme();
  const [card, setCard] = useState<ProgramEfficacy | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    fetchEfficacyCard(planId).then((c) => { if (on) setCard(c); });
    return () => { on = false; };
  }, [planId]);
  if (card === undefined) return null; // no skeleton for a one-liner
  const line = efficacyLine(card);
  return (
    <ACard style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: line.measured ? txt(C, C.lime) : C.ash }}>
        Measured outcome
      </Text>
      <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk, marginTop: 6 }}>{line.headline}</Text>
      <View style={{ marginTop: 4 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro) }}>{line.sub}</Text>
      </View>
    </ACard>
  );
}

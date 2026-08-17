import { useEffect, useRef, useState } from "react";
import { View, Text, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { fs, space, tracking, F, leading, PressScale, MAX_FONT_SCALE } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { APill, RADIUS } from "./kit";
import Sheet from "./sheet";

/**
 * BARCODE SCAN (mobile) — point the camera at a pack.
 *
 * The ONLY missing half of the barcode flow. Resolving a code to a food, the
 * not-found path, and creating the food from there have all shipped for months
 * — a typed or pasted barcode already works on both clients. This adds the
 * camera and hands whatever it reads to the exact same `searchFoods(code,
 * { barcode: true })` call the typed path uses, so a scanned code and a typed
 * one cannot resolve differently.
 *
 * ── IT FIRES ONCE ─────────────────────────────────────────────────────────
 * A barcode scanner emits the same code many times a second while the label is
 * in frame. Without a latch that is dozens of identical lookups and, worse, a
 * sheet that closes and reopens under the athlete's thumb. `seen` latches the
 * first read and the scanner is dead until the sheet is opened again.
 *
 * ── PERMISSION IS A STATE, NOT AN ERROR ───────────────────────────────────
 * Three real states, each with its own screen: not asked (a button that asks),
 * denied (a line saying the scanner needs the camera, with the typed fallback
 * still one tap away), and granted. A denied permission is a choice the athlete
 * made, so it is never re-prompted in a loop — iOS would ignore the second ask
 * anyway, which would leave a button that visibly does nothing.
 *
 * WEB HAS NO TWIN, deliberately: `expo-camera` is a native module, and the
 * browser's getUserMedia + a barcode decoder is a different implementation with
 * different permissions and different failure modes. The parity rule is
 * satisfied by the capability registry rather than by a stub — see
 * `nutrition-barcode-camera`.
 */
export default function BarcodeScanSheet({
  visible,
  onClose,
  onCode,
}: {
  visible: boolean;
  onClose: () => void;
  /** the raw code — handed straight to the shared barcode lookup */
  onCode: (code: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [permission, requestPermission] = useCameraPermissions();
  // Latched per opening: see the note above.
  const seen = useRef(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (visible) { seen.current = false; setScanned(false); }
  }, [visible]);

  const mono = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash } as const;

  const body = () => {
    // Permission not asked yet.
    if (!permission) return null;
    if (!permission.granted) {
      return (
        <View style={{ paddingVertical: space.lg, gap: space.md }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body, "relaxed") }}>
            {permission.canAskAgain
              ? t("w.recovery.nutrition.scan.needsCamera")
              : t("w.recovery.nutrition.scan.deniedCamera")}
          </Text>
          {permission.canAskAgain ? (
            <APill label={t("w.recovery.nutrition.scan.allow")} onPress={requestPermission} />
          ) : null}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, lineHeight: leading(fs.nano, "relaxed") }}>
            {t("w.recovery.nutrition.scan.typeInstead")}
          </Text>
        </View>
      );
    }

    return (
      <View style={{ paddingVertical: space.sm }}>
        <View style={{ height: 300, borderRadius: RADIUS.card, overflow: "hidden", backgroundColor: C.ink }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            // The formats a food package actually carries. Restricting the set
            // is not tidiness — an unrestricted scanner reads QR codes off
            // anything in frame and reports them as barcodes.
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }}
            onBarcodeScanned={({ data }) => {
              if (seen.current || !data) return;
              seen.current = true;
              setScanned(true);
              onCode(String(data).trim());
            }}
          />
          {/* A frame, not a decoration: it tells the athlete where to hold the
              pack, which is the difference between a scanner that works first
              time and one that feels broken. */}
          <View pointerEvents="none" style={{ position: "absolute", left: "12%", right: "12%", top: "32%", bottom: "32%", borderWidth: 2, borderColor: scanned ? C.lime : "rgba(255,255,255,0.7)", borderRadius: RADIUS.inner }} />
        </View>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, marginTop: space.md, textAlign: "center" }}>
          {scanned ? t("w.recovery.nutrition.scan.reading") : t("w.recovery.nutrition.scan.aim")}
        </Text>
      </View>
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.recovery.nutrition.scan.title")}>
      {/* The simulator has no camera, and a black rectangle that never scans
          reads as a bug rather than as a missing device. Say so. */}
      {Platform.OS === "web" ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ ...mono, paddingVertical: space.lg }}>
          {t("w.recovery.nutrition.scan.typeInstead")}
        </Text>
      ) : (
        body()
      )}
    </Sheet>
  );
}

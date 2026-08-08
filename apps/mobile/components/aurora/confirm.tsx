import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput } from "react-native";
import Sheet from "./sheet";
import { APill, RADIUS } from "./kit";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, space, leading, F, MAX_FONT_SCALE } from "../../lib/ui";

/**
 * THE CONFIRM SHEET — the app's own answer where it used to hand the moment to
 * the operating system.
 *
 * The design audit found `Alert.alert` at 34 sites, and they were not
 * incidental: delete a session, leave a plan, erase an account, block a person,
 * deny a coach application, delete an agent, wipe a campaign. The most
 * consequential things a user can do here were the ONLY things not drawn by
 * this product — while the app already owned a Sheet that tracks the finger 1:1,
 * rubber-bands, resolves release by velocity projection and recedes the screen
 * behind it. A user who has learned that gesture met a system alert at exactly
 * the moment they most needed to feel oriented.
 *
 * It is imperative on purpose. `Alert.alert` is imperative, and a
 * declarative-only replacement would have forced every call site to grow a piece
 * of state, a handler and a JSX branch — which is how a "shared" dialog quietly
 * becomes thirty local ones again. `confirm()` returns a promise, so a call site
 * reads as the decision it is:
 *
 *     if (await confirm({ title: "Delete session?", destructive: true })) doDelete();
 *
 * `notify()` covers the other shape the audit found — the ~20 one-button alerts
 * that were reporting an error or a result and had no decision in them at all.
 * Those get a message sheet, not a modal interruption with a fake choice.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** The affirmative button's label. Defaults to the localized "Confirm". */
  confirmLabel?: string;
  /** The dismissive button's label. Defaults to the localized "Cancel". */
  cancelLabel?: string;
  /** Paints the affirmative action in the alert colour and puts it second, so
   *  the destructive choice is never the one under a resting thumb. */
  destructive?: boolean;
  /** Ask for a line of text alongside the decision (a moderation note, a
   *  reason). `confirmText` resolves with it; plain `confirm` ignores it. */
  input?: { placeholder?: string };
}

interface ConfirmApi {
  /** Ask. Resolves true if the user confirmed, false on cancel or dismissal. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Tell. One acknowledgement button, no decision. */
  notify: (title: string, message?: string) => Promise<void>;
  /**
   * Ask, with a line of text. Resolves the entered string (possibly empty) on
   * confirm, or null on cancel.
   *
   * This replaces `Alert.prompt`, which is iOS-only — the moderation console's
   * non-iOS branch silently degraded to a plain confirm and DROPPED the note
   * entirely. One control, and the note now survives on every platform.
   */
  confirmText: (opts: ConfirmOptions) => Promise<string | null>;
}

const Ctx = createContext<ConfirmApi | null>(null);

/** Live request, plus the resolver the sheet's buttons settle. */
type Pending = (ConfirmOptions & { kind: "confirm" | "notify" }) | null;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { palette } = useTheme();
  const { t } = useLang();
  const [pending, setPending] = useState<Pending>(null);
  const [text, setText] = useState("");
  const resolver = useRef<((v: boolean) => void) | null>(null);
  // A dismissal (scrim tap, drag-down, back gesture) must settle the promise
  // exactly like Cancel — a caller awaiting this can never be left hanging.
  const settle = useCallback((value: boolean) => {
    setPending(null);
    const r = resolver.current;
    resolver.current = null;
    r?.(value);
  }, []);

  // The live field value, read at settle time — the resolver closes over this
  // ref rather than over `text`, which would be stale by the time it fires.
  const entered = useRef("");
  entered.current = text;

  const api = useMemo<ConfirmApi>(
    () => ({
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setPending({ ...opts, kind: "confirm" });
        }),
      notify: (title, message) =>
        new Promise<void>((resolve) => {
          resolver.current = () => resolve();
          setPending({ title, message, kind: "notify" });
        }),
      confirmText: (opts) =>
        new Promise<string | null>((resolve) => {
          setText("");
          resolver.current = (ok) => resolve(ok ? entered.current : null);
          setPending({ ...opts, kind: "confirm" });
        }),
    }),
    [],
  );

  const label = (key: string, fallback: string) => (t(key) === key ? fallback : t(key));

  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet
        visible={pending != null}
        onClose={() => settle(false)}
        title={pending?.title}
        scroll={false}
        detents={["medium"]}
      >
        <View style={{ gap: space.md }}>
          {pending?.message ? (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontFamily: F.reg, fontSize: fs.note, lineHeight: leading(fs.note, "relaxed"), color: palette.ash }}
            >
              {pending.message}
            </Text>
          ) : null}

          {pending?.input ? (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={pending.input.placeholder}
              placeholderTextColor={palette.ash}
              accessibilityLabel={pending.input.placeholder ?? pending.title}
              autoFocus
              style={{
                fontFamily: F.reg,
                fontSize: fs.note,
                color: palette.chalk,
                backgroundColor: palette.ink,
                borderWidth: 1,
                borderColor: palette.line,
                borderRadius: RADIUS.field,
                paddingHorizontal: space.lg,
                paddingVertical: space.md,
              }}
            />
          ) : null}

          {pending?.kind === "notify" ? (
            <APill label={label("common.ok", "OK")} onPress={() => settle(true)} />
          ) : (
            <>
              {/* Cancel sits FIRST and destructive second: on a phone the lower
                  button is the one under a resting thumb, and that must never be
                  the irreversible one. */}
              <APill
                label={pending?.cancelLabel ?? label("common.cancel", "Cancel")}
                variant="soft"
                onPress={() => settle(false)}
              />
              <APill
                label={pending?.confirmLabel ?? label("common.confirm", "Confirm")}
                variant={pending?.destructive ? "outline" : "primary"}
                color={pending?.destructive ? palette.red : undefined}
                onPress={() => settle(true)}
              />
            </>
          )}
        </View>
      </Sheet>
    </Ctx.Provider>
  );
}

/**
 * The app's confirm/notify pair. Throws outside the provider rather than
 * silently falling back to `Alert.alert` — a silent fallback is how half the app
 * would end up back on the system dialog without anyone noticing.
 */
export function useConfirm(): ConfirmApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useConfirm must be used inside <ConfirmProvider> (mounted in app/_layout.tsx)");
  return api;
}

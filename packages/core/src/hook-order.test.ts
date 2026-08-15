import { describe, expect, it } from "vitest";
import { findHooksAfterEarlyReturn, blankLiterals } from "./hook-order";

/**
 * THE DETECTOR'S OWN FIXTURES.
 *
 * The two app-side guards (apps/mobile/lib/hook-order.test.ts,
 * apps/web/__tests__/hook-order.test.ts) run this scanner across their trees
 * and assert the result is empty. An empty result is exactly what a BROKEN
 * scanner returns too, so those guards are only worth their runtime if this
 * file holds: the shapes it must catch, and the shapes it must not.
 *
 * The catch-list came from real code — both entries are mistakes that were in
 * the repo (see the hook-order-guard capability). The must-not list is the
 * larger half, because every false positive is pressure to delete the guard.
 */

describe("the hook-order detector", () => {
  it("catches a hook stranded below an early return", () => {
    const found = findHooksAfterEarlyReturn(`
export default function Drawer({ open }: { open: boolean }) {
  const [q, setQ] = useState("");
  if (!open) return null;
  const index = useMemo(() => build(q), [q]);
  return <View>{index}</View>;
}
`);
    expect(found).toHaveLength(1);
    expect(found[0]?.hook).toBe("useMemo");
  });

  it("catches the guard clause spelled as a block", () => {
    // The commonest spelling, and the one the first draft of this scanner
    // missed: the `return` sits a level deeper than the one-liner's.
    const found = findHooksAfterEarlyReturn(`
function Screen({ open }) {
  if (!open) {
    return null;
  }
  const insets = useSafeAreaInsets();
  return <View style={insets} />;
}
`);
    expect(found.map((f) => f.hook)).toEqual(["useSafeAreaInsets"]);
  });

  it("reports where to look — the hook's line and the return that skips it", () => {
    const [f] = findHooksAfterEarlyReturn(
      ["function S({ open }) {", "  if (!open) return null;", "  const x = useMemo(() => 1, []);", "  return null;", "}"].join("\n"),
      "screen.tsx",
    );
    expect(f).toMatchObject({ file: "screen.tsx", line: 3, returnLine: 2, hook: "useMemo" });
  });

  it("passes the same component once its hooks are hoisted", () => {
    expect(
      findHooksAfterEarlyReturn(`
export default function Drawer({ open }: { open: boolean }) {
  const [q, setQ] = useState("");
  const index = useMemo(() => build(q), [q]);
  if (!open) return null;
  return <View>{index}</View>;
}
`),
    ).toEqual([]);
  });

  it("does not flag a hook in a nested callback, which is a different thing", () => {
    // A `use…` name inside a render callback is not part of THIS component's
    // hook list, and the returned JSX is deeper still.
    expect(
      findHooksAfterEarlyReturn(`
function Screen({ open }) {
  const C = useTheme();
  if (!open) return null;
  const row = (r) => {
    const x = useless(r);
    return <Text>{x}</Text>;
  };
  return <View>{row(1)}</View>;
}
`),
    ).toEqual([]);
  });

  it("does not carry a return across a scope it has left", () => {
    // The provider returns; the exported hook below is a NEW top-level scope.
    expect(
      findHooksAfterEarlyReturn(`
export function LangProvider({ children }) {
  return <Ctx.Provider>{children}</Ctx.Provider>;
}

export function useLang() {
  const ctx = useContext(LangCtx);
  return ctx;
}
`),
    ).toEqual([]);
  });

  it("counts braces in code, never in comments or strings", () => {
    // An unbalanced brace inside a string would desync the depth count and
    // silently blind the scan from that line on.
    const src = 'const a = "{{{"; // }}}\nconst b = `${x}`;';
    const blanked = blankLiterals(src);
    expect(blanked.split("\n")[0]).not.toContain("{");
    expect(blanked).toHaveLength(src.length); // offsets preserved, so lines stay true
    expect(
      findHooksAfterEarlyReturn(`
function Screen({ open }) {
  const label = "if (x) return null; {";
  const memo = useMemo(() => 1, []);
  return <Text>{label}</Text>;
}
`),
    ).toEqual([]);
  });

  it("is not fooled by the rule written down in a comment", () => {
    // This repo documents the rule at the crash sites, so the prose describing
    // the bug must never read as the bug.
    expect(
      findHooksAfterEarlyReturn(`
function Screen({ open }) {
  // if (!open) return null;  <- must stay BELOW the hooks
  const memo = useMemo(() => 1, []);
  if (!open) return null;
  return <Text>{memo}</Text>;
}
`),
    ).toEqual([]);
  });
});

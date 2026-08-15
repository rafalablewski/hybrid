import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findHooksAfterEarlyReturn, blankLiterals } from "./hook-order";

/**
 * THE HOOK-ORDER GUARD.
 *
 * The side menu crashed the app the first time anyone tapped their avatar:
 *
 *   Error: Rendered more hooks than during the previous render.
 *     at updateMemo … at AuroraSideMenu … at AppHeader
 *
 * The drawer is MOUNTED on every tab root and bails with `if (!open) return
 * null` while shut. Two `useMemo`s — the cross-app search index and its results
 * — sat BELOW that line. So the component rendered 16 hooks closed and 18 open,
 * and React, which matches hooks by call order and nothing else, threw on the
 * render where the count changed. Every shut render was fine, which is exactly
 * why it survived to TestFlight: the bug needs the OPEN render to be the second
 * one, and the drawer's whole job is to start shut.
 *
 * The scan found a second, unshipped instance of the identical mistake in
 * app/workout.tsx — `useSafeAreaInsets()` below `if (phase === "done" &&
 * summary) return <Summary …>`, three lines under a comment that said hooks
 * must stay above the early return. That is the argument for a guard rather
 * than a fix: the rule was known, written down at the crash site, and broken
 * anyway, because nothing but a human eye was checking.
 *
 * There is no ESLint in this repo to carry `react-hooks/rules-of-hooks`, so the
 * check is a source scan in the idiom of the guards beside it (app-header,
 * expo-alignment): read the tree as DATA, fail on the shape.
 */

const MOBILE = resolve(__dirname, "..");

/** Every component file on the phone — the app routes and the components. */
function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".expo" || e.name === "ios" || e.name === "android") continue;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) tsxFiles(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

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
    expect(found[0].hook).toBe("useMemo");
  });

  it("catches the guard clause spelled as a block", () => {
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
    // A custom hook called inside a child component's body, or a `use…` name
    // inside a render callback, is not part of THIS component's hook list.
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
    const blanked = blankLiterals('const a = "{{{"; // }}}\nconst b = `${x}`;');
    expect(blanked.split("\n")[0]).not.toContain("{");
    expect(blanked).toHaveLength('const a = "{{{"; // }}}\nconst b = `${x}`;'.length);
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
});

describe("the hook-order guard — no component may skip its own hooks", () => {
  it("keeps every hook above every early return, on every screen", () => {
    const offenders = tsxFiles(MOBILE).flatMap((f) =>
      findHooksAfterEarlyReturn(readFileSync(f, "utf8"), f.slice(MOBILE.length + 1)),
    );
    expect(
      offenders.map((o) => `${o.file}:${o.line} — ${o.hook}() sits below the early return on line ${o.returnLine}`),
    ).toEqual([]);
  });

  it("still names the drawer's memos as the reason it exists", () => {
    // The two hooks the crash was about, above the bail-out that skipped them.
    const src = readFileSync(resolve(MOBILE, "components/aurora/side-menu.tsx"), "utf8");
    const searchIndex = src.indexOf("const searchIndex = useMemo");
    const found = src.indexOf("const found = useMemo");
    const bail = src.indexOf("if (!open) return null;");
    expect(searchIndex).toBeGreaterThan(-1);
    expect(found).toBeGreaterThan(-1);
    expect(bail).toBeGreaterThan(found);
    expect(found).toBeGreaterThan(searchIndex);
  });
});

import { describe, it, expect } from "vitest";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// THE DEAD-ZONE GUARD — a whole screen crashing on a helper defined too low.
//
// The Performance tab died on `Something went wrong` for every athlete whose
// strongest result was an endurance one. Not a data bug, not a null: the Level
// card's sentence is built in a `useMemo`, and the `figure()` helper it calls
// was declared BELOW that memo. A useMemo factory runs DURING render, so the
// `const` was still in its temporal dead zone and reading it threw
// `ReferenceError: Cannot access 'figure' before initialization`, which the
// error boundary turned into a blank screen. It only fired on the endurance
// branch of a ternary, so a strength-topped athlete never saw it.
//
// TypeScript CANNOT catch this — inside a callback it assumes deferred
// execution and stays quiet — and neither can a render test that only exercises
// one branch. So the rule is made structural instead: anything a
// render-time hook factory READS must be DECLARED ABOVE IT.
//
// Deferred callbacks (useEffect, useCallback, event handlers) are not scanned:
// they run after the whole body has been evaluated, so a later `const` is fine.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** Hooks whose callback argument runs synchronously, inside the render pass. */
const EAGER_HOOKS = new Set(["useMemo", "useState", "useReducer"]);

const SCAN_DIRS = [
  ["apps", "web", "components"],
  ["apps", "web", "lib"],
  ["apps", "web", "app"],
  ["apps", "mobile", "components"],
  ["apps", "mobile", "lib"],
  ["apps", "mobile", "app"],
].map((p) => join(REPO_ROOT, ...p));

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) sourceFiles(abs, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(abs);
  }
  return out;
}

/** Every name DECLARED inside a subtree — params, consts, functions, catches.
 *  A read of one of these is reading the inner binding, not the outer one, so
 *  it is not a dead-zone read at all. */
function shadowedNames(root: ts.Node): Set<string> {
  const names = new Set<string>();
  const bind = (n: ts.BindingName) => {
    if (ts.isIdentifier(n)) names.add(n.text);
    else for (const el of n.elements) {
      if (ts.isBindingElement(el)) bind(el.name);
    }
  };
  const walk = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) || ts.isParameter(n)) bind(n.name);
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) names.add(n.name.text);
    ts.forEachChild(n, walk);
  };
  walk(root);
  return names;
}

/** True when this identifier is a LABEL rather than a read: the key half of
 *  `{ figure: x }`, the `.figure` of a property access, or a type name. */
function isLabelPosition(id: ts.Identifier): boolean {
  const p = id.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return true;
  if (ts.isPropertyAssignment(p) && p.name === id) return true;
  if (ts.isPropertySignature(p) && p.name === id) return true;
  if (ts.isTypeReferenceNode(p) || ts.isQualifiedName(p)) return true;
  if (ts.isVariableDeclaration(p) && p.name === id) return true;
  return false;
}

function deadZoneReads(file: string): string[] {
  const src = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = relative(REPO_ROOT, file);
  const found: string[] = [];
  const line = (pos: number) => src.getLineAndCharacterOfPosition(pos).line + 1;

  const visitBody = (body: ts.Block) => {
    // The body's own block-scoped declarations, with where they come into being.
    const declaredAt = new Map<string, number>();
    for (const st of body.statements) {
      if (!ts.isVariableStatement(st)) continue;
      if ((st.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)) === 0) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) declaredAt.set(d.name.text, d.getStart());
      }
    }
    if (!declaredAt.size) return;

    const scan = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text
          : ts.isIdentifier(n.expression) ? n.expression.text : "";
        if (EAGER_HOOKS.has(callee)) {
          const callStart = n.getStart();
          for (const arg of n.arguments) {
            const shadowed = shadowedNames(arg);
            const reads = (m: ts.Node) => {
              if (ts.isIdentifier(m) && !isLabelPosition(m) && !shadowed.has(m.text)) {
                const at = declaredAt.get(m.text);
                if (at != null && at > callStart) {
                  found.push(`${rel}:${line(m.getStart())} — ${callee} reads '${m.text}', declared below at line ${line(at)}`);
                }
              }
              ts.forEachChild(m, reads);
            };
            reads(arg);
          }
        }
      }
      ts.forEachChild(n, scan);
    };
    for (const st of body.statements) scan(st);
  };

  const walk = (n: ts.Node) => {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n))
      && n.body && ts.isBlock(n.body)) visitBody(n.body);
    ts.forEachChild(n, walk);
  };
  walk(src);
  return found;
}

describe("render-time dead zone", () => {
  // The scan parses BOTH clients' whole source trees with the TypeScript
  // compiler — seconds of work by construction, and it grows with the codebase.
  // Vitest's 5s default was never the right contract for it: 2.5s on a dev
  // machine, 5.97s on a CI runner, so the guard failed on the runner for being
  // slow rather than for finding anything. The budget is generous on purpose —
  // this number is a hang-catcher, not a performance assertion.
  it("no eager hook factory reads a const declared below it", () => {
    const offenders = SCAN_DIRS.flatMap((d) => sourceFiles(d)).flatMap(deadZoneReads);
    expect(offenders, `A useMemo/useState factory runs during render — move the helper ABOVE it:\n${offenders.join("\n")}`)
      .toEqual([]);
  }, 120_000);
});

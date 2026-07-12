import { Fragment, type CSSProperties, type ReactNode } from "react";

/**
 * A meta line whose facts are separated by a thin vertical HAIRLINE rule
 * instead of a middot — the app's one consistent way to divide inline facts
 * ("8 weeks │ 6×/week │ % of 1RM"). Pass an array of `parts` (falsy entries are
 * dropped) OR a dash/middot-joined `text` string (split internally on " – " or
 * " · ", so a stored/i18n meta renders as hairlines without changing the data). The rule
 * inherits the current text colour at low opacity, so it reads as structure,
 * not punctuation.
 */
export function MetaLine({ parts, text, style }: { parts?: ReactNode[]; text?: string; style?: CSSProperties }) {
  const items = (parts ?? (text ? text.split(/ [·–] /) : [])).filter((p) => p !== null && p !== undefined && p !== false && p !== "") as ReactNode[];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8, minWidth: 0, ...style }}>
      {items.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden style={{ width: 1, height: "0.82em", background: "currentColor", opacity: 0.32, flex: "none" }} />}
          <span>{p}</span>
        </Fragment>
      ))}
    </span>
  );
}

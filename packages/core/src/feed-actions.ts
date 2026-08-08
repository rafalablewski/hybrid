/**
 * FEED ACTIONS — save, share, and the overflow menu, for BOTH clients.
 *
 * Zone F of a post (feed-card.ts) had two verbs: kudos and comment. Both are
 * PUBLIC — they hand something to the author. What was missing is the pair of
 * verbs a reader performs for themselves:
 *
 *   • SAVE (bookmark) — "I want this back later" (a lift scheme, a pace, a
 *     session worth stealing). Private, silent, no notification to the author.
 *   • SHARE — take the post out of the app.
 *
 * ...plus the third affordance every stream needs, the one that answers "I do
 * not want to see this": the overflow menu (⋯) at the top-right of the row.
 *
 * WHAT LIVES HERE AND WHY. Both clients must show the same items, in the same
 * order, with the same labels and the same idea of what is real vs a
 * placeholder — so the MODEL is here and only the RENDERING is per-client. A
 * menu item added to web and forgotten on mobile is exactly the drift
 * CLAUDE.md's parity rule exists to prevent, and the only way to make that
 * structurally impossible is for neither client to own the list.
 *
 * SAVED STATE IS PER-DEVICE, deliberately, and it is the same contract as the
 * notification read-state (lib/notif-read.ts on both clients): a small,
 * idempotent set of ids in localStorage / AsyncStorage. It needs no migration
 * on a database this sandbox cannot reach, and the failure mode is mild — a
 * post saved on the phone isn't in the laptop's list. Server-side sync is
 * tracked as `feed-save-server-sync` in capabilities.ts, NOT quietly assumed.
 *
 * PLACEHOLDERS ARE MARKED AS SUCH. `placeholder: true` on a menu action means
 * the row is drawn but nothing is wired behind it. The clients render that
 * honestly (a SOON tag on tap) rather than firing a no-op that reads as a bug.
 * Follow/mute/block DO have working endpoints elsewhere in the product
 * (/api/social/follow, /api/social/block) — wiring the menu to them is its own
 * change, tracked in capabilities.
 */

// --------------------------------------------------------- saved (bookmark) --

/** The anchor a reaction attaches to — the same (subjectType, subjectId) pair
 *  kudos and comments use, so a saved item survives the feed being rebuilt. */
export interface FeedSubjectRef {
  subjectType: string;
  subjectId: string;
}

/** `type:id` — the key a saved post is stored under. Stable across sessions,
 *  because the feed's own `id` is derived and the list is rebuilt every load. */
export function feedSubjectKey(ref: FeedSubjectRef): string {
  return `${ref.subjectType}:${ref.subjectId}`;
}

/** The per-device saved set, newest first. An array rather than a Set so it
 *  serialises as-is and keeps its order (a Saved screen wants newest at top). */
export interface FeedSavedState {
  ids: string[];
}

export const DEFAULT_FEED_SAVED: FeedSavedState = { ids: [] };

/** The storage key, shared so web's localStorage and mobile's AsyncStorage can
 *  never disagree on where this lives. */
export const FEED_SAVED_STORAGE_KEY = "hybrid.feedSaved";

/** A cap, so a device that saves everything for two years can't grow an
 *  unbounded blob in a synchronous storage API. Oldest fall off the end. */
export const FEED_SAVED_LIMIT = 500;

/** Coerce whatever came back out of storage into a valid state. A corrupt or
 *  half-written blob must degrade to "nothing saved", never throw on read. */
export function normalizeFeedSaved(raw: unknown): FeedSavedState {
  if (!raw || typeof raw !== "object") return DEFAULT_FEED_SAVED;
  const ids = (raw as { ids?: unknown }).ids;
  if (!Array.isArray(ids)) return DEFAULT_FEED_SAVED;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
    if (clean.length >= FEED_SAVED_LIMIT) break;
  }
  return { ids: clean };
}

export function isFeedSaved(state: FeedSavedState, key: string): boolean {
  return state.ids.includes(key);
}

/** Toggle one post. Saving puts it at the FRONT (newest first); unsaving drops
 *  it. Pure — the caller persists the result. */
export function toggleFeedSaved(state: FeedSavedState, key: string): FeedSavedState {
  if (!key) return state;
  if (isFeedSaved(state, key)) return { ids: state.ids.filter((k) => k !== key) };
  return { ids: [key, ...state.ids].slice(0, FEED_SAVED_LIMIT) };
}

// ------------------------------------------------------------------- share --

/** The production origin. `hybrid.app` is the intended production domain (see
 *  core/guidance.ts) and is already what the nutrition + profile shares emit,
 *  so a shared post links the same way as everything else the app hands out. */
export const FEED_SHARE_ORIGIN = "https://hybrid.app";

/** The link a shared post carries. The app shell addresses screens through the
 *  query string (`?s=<screen>`, see apps/web/lib/deep-link.ts), so this lands
 *  the recipient on the feed with the post named. Landing ON the post — scroll
 *  + highlight — is tracked as `feed-share-deep-link`; the link is correct
 *  either way, it just doesn't scroll yet. */
export function feedShareUrl(ref: FeedSubjectRef): string {
  return `${FEED_SHARE_ORIGIN}/app?s=feed&post=${encodeURIComponent(feedSubjectKey(ref))}`;
}

/** What the OS share sheet receives. */
export interface FeedSharePayload {
  /** The sheet's own title (Android/desktop show it; iOS mostly ignores it). */
  title: string;
  /** The message body, WITHOUT the url — clients that take both append it. */
  text: string;
  url: string;
}

/**
 * Compose the share payload. `headline` is passed in already translated: the
 * clients own `t()`, and the headline is the same string the row is showing —
 * so what you shared reads like what you tapped.
 *
 * The name comes first because a share lands in a chat where nobody has the
 * app's context: "Ada Ruiz — 180 kg Back Squat" is legible cold, "180 kg Back
 * Squat" is not.
 */
export function feedSharePayload(
  item: FeedSubjectRef & { author: { displayName?: string | null; handle?: string | null } },
  headline: string,
  appName = "HYBRID",
): FeedSharePayload {
  const who = item.author.displayName?.trim() || (item.author.handle ? `@${item.author.handle}` : "");
  const line = headline.trim();
  // An en dash joins the two — never a middot (CLAUDE.md).
  const text = [who, line].filter(Boolean).join(" – ");
  return {
    title: appName,
    text: text || appName,
    url: feedShareUrl(item),
  };
}

// ------------------------------------------------------------ overflow menu --

export type FeedMenuActionKey =
  | "follow"
  | "mute"
  | "notInterested"
  | "report"
  | "block"
  | "delete";

export interface FeedMenuAction {
  key: FeedMenuActionKey;
  /** i18n key for the row's label. `{h}` is the author's @handle where present. */
  labelKey: string;
  /** Drawn in the red channel and placed last — leaving and deleting are the
   *  two things you must not hit by accident. */
  destructive?: boolean;
  /** true = the row is drawn but nothing is wired behind it yet. */
  placeholder: boolean;
}

/**
 * Every row the menu can ever draw, in the order it draws them.
 *
 * ONE LABEL PER ROW, no explanatory second line. The menu is a small anchored
 * popover hanging off the ⋯, not a page: at that size a description under each
 * label doubles the card's height and turns a glance into a read. Every label
 * here says what it does on its own ("Mute @ada", "Not interested") — a row
 * that needed a paragraph to be understood would be the wrong row.
 */
const MENU: Record<FeedMenuActionKey, Omit<FeedMenuAction, "key">> = {
  follow: { labelKey: "feed.menu.follow", placeholder: true },
  mute: { labelKey: "feed.menu.mute", placeholder: true },
  notInterested: { labelKey: "feed.menu.notInterested", placeholder: true },
  report: { labelKey: "feed.menu.report", placeholder: true },
  block: { labelKey: "feed.menu.block", destructive: true, placeholder: true },
  delete: { labelKey: "feed.menu.delete", destructive: true, placeholder: false },
};

export interface FeedMenuInput {
  /** the viewer's own post/session? */
  mine: boolean;
  /** "post" | "session" | "pr" — only a real Post row can be deleted. */
  subjectType: string;
  /** whether a delete handler was actually supplied by the screen. */
  canDelete?: boolean;
}

/**
 * The menu for one row.
 *
 * MY OWN POST gets no follow/mute/block/report — every one of them is
 * nonsensical aimed at yourself, and a menu full of dead rows is how a product
 * teaches people not to open menus. It gets the delete that used to be a bare
 * × in this exact corner, now labelled and explained.
 *
 * SOMEONE ELSE'S gets the four "less of this" verbs, with block last because
 * it is the destructive one.
 *
 * NOT HERE: "copy link". Sharing is zone F's own icon, and both platforms'
 * share sheets already contain Copy — a second path to the same clipboard is
 * a row that has to be read and skipped every time the menu opens. (On mobile
 * it would also need a native clipboard module this build doesn't carry.)
 *
 * An EMPTY list is a valid answer — my own session or PR row has nothing to
 * offer — and the clients then draw no ⋯ at all rather than an empty sheet.
 */
export function feedMenuActions(input: FeedMenuInput): FeedMenuAction[] {
  const keys: FeedMenuActionKey[] = input.mine
    ? []
    : ["follow", "mute", "notInterested", "report", "block"];
  // Delete only exists for a first-class Post — a session or a derived PR row
  // isn't deletable from the feed, and offering it would be a lie.
  if (input.mine && input.subjectType === "post" && input.canDelete) keys.push("delete");
  return keys.map((key) => ({ key, ...MENU[key] }));
}

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
 * SAVED STATE IS A LIST OF KEYS, held on the device (localStorage /
 * AsyncStorage, the notification read-state contract) and MIRRORED to the
 * server (SavedPost, reference/sql-saved-post.sql) so the shelf follows the
 * athlete between phone and laptop. The device copy is not a cache — it is what
 * the UI reads, so a bookmark fills on the press frame and the shelf still
 * works offline; `reconcileFeedSaved` below is the whole of the sync policy.
 * Until the table is migrated the sync routes soft-degrade and the device copy
 * simply stands alone, which is exactly how this shipped first.
 *
 * PLACEHOLDERS ARE MARKED AS SUCH. `placeholder: true` on a menu action means
 * the row is drawn but nothing is wired behind it, and the clients render that
 * honestly (a SOON tag on press) rather than firing a no-op that reads as a
 * bug. Follow, block and report are now REAL — they hit /api/social/follow,
 * /api/social/block and /api/reports. Mute and "not interested" are still
 * placeholders because each needs state that does not exist yet: mute needs a
 * column on Follow and a filter in buildSocialFeed, and "not interested" is a
 * ranking signal that should feed feed-rank.ts rather than hard-hide a row.
 * Flip the flag as each lands — the unit test asserts on exactly this set.
 */

import type { Relation } from "./social";

// --------------------------------------------------------- saved (bookmark) --

/** The anchor a reaction attaches to — the same (subjectType, subjectId) pair
 *  kudos and comments use, so a saved item survives the feed being rebuilt. */
export interface FeedSubjectRef {
  subjectType: string;
  subjectId: string;
}

/**
 * `pr` IS `session`. A record is no longer a card of its own — it is a line on
 * the workout that set it (feed-card.ts `sessionDetail`) — and both always
 * pointed at the same Session id. So every key that re-enters the system, from
 * device storage or from a link somebody was sent months ago, names the post
 * that exists today rather than the card that used to.
 */
export function canonicalFeedSubjectType(subjectType: string): string {
  return subjectType === "pr" ? "session" : subjectType;
}

/** `type:id` — the key a saved post is stored under. Stable across sessions,
 *  because the feed's own `id` is derived and the list is rebuilt every load. */
export function feedSubjectKey(ref: FeedSubjectRef): string {
  return `${canonicalFeedSubjectType(ref.subjectType)}:${ref.subjectId}`;
}

/** The subject types a saved key may name. `buildSocialFeed` only ever emits
 *  `session` and `post` now; `pr` is still accepted because devices and links
 *  from before the merge carry it, and it resolves to its session. */
export const FEED_SUBJECT_TYPES = ["session", "pr", "post"] as const;

/**
 * The inverse of `feedSubjectKey`, and the ONLY way a stored key should re-enter
 * the system. It is the trust boundary: the Saved screen posts these keys to the
 * server to be resolved into rows, and they come from device storage — which
 * anyone can edit. So the type is checked against the closed set above and the
 * id is length-bounded; anything else is null, not a query.
 */
export function parseFeedSubjectKey(key: unknown): FeedSubjectRef | null {
  if (typeof key !== "string") return null;
  const at = key.indexOf(":");
  if (at <= 0) return null;
  const subjectType = key.slice(0, at);
  const subjectId = key.slice(at + 1);
  if (!(FEED_SUBJECT_TYPES as readonly string[]).includes(subjectType)) return null;
  if (!subjectId || subjectId.length > 64) return null;
  return { subjectType: canonicalFeedSubjectType(subjectType), subjectId };
}

/** How many saved keys one request resolves. The store holds up to 500 and
 *  resolving one costs the author's session history, so the screen pages
 *  rather than asking the server to rebuild everything at once. */
export const FEED_SAVED_PAGE = 40;

/**
 * Drop keys whose row no longer exists.
 *
 * ONLY for rows that are genuinely GONE (deleted). A row that merely turned
 * invisible — the author went private, or blocked you — must stay saved: that
 * state reverses, and silently forgetting a post because someone flipped a
 * privacy switch is the same swallow-your-bookmarks failure as having no shelf
 * at all. The Saved screen says how many are hidden instead.
 */
export function pruneFeedSaved(state: FeedSavedState, gone: string[]): FeedSavedState {
  if (!gone.length) return state;
  const drop = new Set(gone);
  const ids = state.ids.filter((k) => !drop.has(k));
  return ids.length === state.ids.length ? state : { ...state, ids };
}

/**
 * Put resolved items back into SAVE order (newest save first), not the order
 * the server happened to build them in. What the athlete remembers is when they
 * saved a thing, not when it was posted — a card saved this morning belongs at
 * the top even if the session is from March.
 */
export function orderBySaved<T extends FeedSubjectRef>(state: FeedSavedState, items: T[]): T[] {
  const rank = new Map(state.ids.map((k, i) => [k, i]));
  return [...items].sort(
    (a, b) => (rank.get(feedSubjectKey(a)) ?? Infinity) - (rank.get(feedSubjectKey(b)) ?? Infinity),
  );
}

/** The saved set, newest first. An array rather than a Set so it serialises
 *  as-is and keeps its order (the Saved screen wants newest at top). */
export interface FeedSavedState {
  ids: string[];
  /**
   * Has this device handed its pre-sync list to the server yet?
   *
   * It exists to make the ONE-TIME adoption safe. A device that saved posts
   * before SavedPost existed holds a list the server has never seen, so the
   * first sync UNIONS the two — nothing is lost in either direction. Every sync
   * after that takes the server's list wholesale, which is what makes an unsave
   * on one device stick on the others. Without this flag the union would run
   * forever and an unsaved post would resurrect from any stale device.
   */
  synced?: boolean;
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
  const synced = (raw as { synced?: unknown }).synced === true;
  return { ids: dedupe(ids), ...(synced ? { synced: true } : {}) };
}

/** Strings only, first occurrence wins, capped. Used on everything that enters
 *  the list — storage, and the server's own list.
 *
 *  Keys are CANONICALISED on the way in: a device that saved a `pr:` card
 *  before records moved onto the workout keeps its bookmark, on the post that
 *  card is now part of, and never keeps two entries for one post. */
function dedupe(input: unknown[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string" || !raw) continue;
    const ref = parseFeedSubjectKey(raw);
    const id = ref ? feedSubjectKey(ref) : raw;
    if (seen.has(id)) continue;
    seen.add(id);
    clean.push(id);
    if (clean.length >= FEED_SAVED_LIMIT) break;
  }
  return clean;
}

export function isFeedSaved(state: FeedSavedState, key: string): boolean {
  return state.ids.includes(key);
}

/** Toggle one post. Saving puts it at the FRONT (newest first); unsaving drops
 *  it. Pure — the caller persists the result. */
export function toggleFeedSaved(state: FeedSavedState, key: string): FeedSavedState {
  if (!key) return state;
  // `synced` rides along on every derivation — losing it would put the device
  // back into first-sync mode and resurrect whatever it just unsaved.
  if (isFeedSaved(state, key)) return { ...state, ids: state.ids.filter((k) => k !== key) };
  return { ...state, ids: [key, ...state.ids].slice(0, FEED_SAVED_LIMIT) };
}

/**
 * Reconcile this device's list with the server's (SavedPost).
 *
 * TWO RULES, and the flag on the state decides which applies:
 *
 *   FIRST SYNC (this device has never pushed) — UNION. The device may hold
 *   saves made before the table existed, and the server may hold saves from
 *   another device. Neither is wrong, so both survive: the local list leads
 *   (this is the device the athlete is looking at), the server's unknowns
 *   follow, and everything the server hasn't got is handed back in `push`.
 *
 *   EVERY SYNC AFTER — the SERVER WINS, wholesale. This is what makes an unsave
 *   stick: the union can't tell "you removed this" from "this device hasn't
 *   heard about it yet", so running it forever would resurrect an unsaved post
 *   from any stale device. Once a device has pushed, the server has heard
 *   everything it knows, and disagreement means someone else changed something.
 *
 * `push` is the keys the server is missing — empty on every non-first sync,
 * because by then the server's list IS the answer.
 */
export function reconcileFeedSaved(
  local: FeedSavedState,
  serverIds: string[],
): { next: FeedSavedState; push: string[] } {
  const server = dedupe(serverIds);
  if (local.synced) return { next: { ids: server, synced: true }, push: [] };
  const known = new Set(local.ids);
  const union = dedupe([...local.ids, ...server.filter((k) => !known.has(k))]);
  const onServer = new Set(server);
  return { next: { ids: union, synced: true }, push: union.filter((k) => !onServer.has(k)) };
}

// ------------------------------------------------------------------- share --

/** The production origin. `hybrid.app` is the intended production domain (see
 *  core/guidance.ts) and is already what the nutrition + profile shares emit,
 *  so a shared post links the same way as everything else the app hands out. */
export const FEED_SHARE_ORIGIN = "https://hybrid.app";

/**
 * The link a shared post carries — and it lands ON THE POST, not near it.
 *
 * A post has its own address on both clients now (the individual post screen),
 * so this is the same address the app itself navigates to: the app shell
 * addresses screens through the query string (`?s=<screen>`, see
 * apps/web/lib/deep-link.ts) and `post` names which one. The recipient opens
 * the workout, its records and its thread — not the top of a ranked stream that
 * may not even contain the thing they were sent.
 */
export function feedShareUrl(ref: FeedSubjectRef): string {
  return `${FEED_SHARE_ORIGIN}/app?s=post&post=${encodeURIComponent(feedSubjectKey(ref))}`;
}

/** The same post's route on MOBILE (expo-router). One helper so a deep link, a
 *  feed row and a saved row can't each invent their own path. */
export function feedPostPath(ref: FeedSubjectRef): string {
  return `/post?type=${encodeURIComponent(ref.subjectType)}&id=${encodeURIComponent(ref.subjectId)}`;
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
 *
 * `follow` and `report` carry only their DEFAULT label; both are rewritten
 * below, because what they say depends on what you're looking at (whether you
 * already follow this person, and whether the row is a real post or a derived
 * session). Everything else says one thing always.
 */
const MENU: Record<FeedMenuActionKey, Omit<FeedMenuAction, "key">> = {
  follow: { labelKey: "feed.menu.follow", placeholder: false },
  mute: { labelKey: "feed.menu.mute", placeholder: true },
  notInterested: { labelKey: "feed.menu.notInterested", placeholder: true },
  report: { labelKey: "feed.menu.report", placeholder: false },
  block: { labelKey: "feed.menu.block", destructive: true, placeholder: false },
  delete: { labelKey: "feed.menu.delete", destructive: true, placeholder: false },
};

export interface FeedMenuInput {
  /** the viewer's own post/session? */
  mine: boolean;
  /** "post" | "session" | "pr" — only a real Post row can be deleted. */
  subjectType: string;
  /** whether a delete handler was actually supplied by the screen. */
  canDelete?: boolean;
  /**
   * The viewer's relation to the author, as the feed already computes it. A
   * follow row that says "Follow" to someone you already follow is worse than
   * no row: it makes the menu look like it doesn't know who you are.
   * Absent = treat as not following, which is the safe direction (the worst
   * case is a follow that no-ops server-side).
   */
  relation?: Relation;
}

/** Relations that mean "I already follow this person", so the row offers the
 *  way OUT rather than the way in. */
const FOLLOWING: Relation[] = ["following", "friend", "close"];

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
 * offer — and the clients then draw no ⋯ at all rather than an empty card.
 */
export function feedMenuActions(input: FeedMenuInput): FeedMenuAction[] {
  const keys: FeedMenuActionKey[] = input.mine
    ? []
    : ["follow", "mute", "notInterested", "report", "block"];
  // Delete only exists for a first-class Post — a session or a derived PR row
  // isn't deletable from the feed, and offering it would be a lie.
  if (input.mine && input.subjectType === "post" && input.canDelete) keys.push("delete");

  const following = FOLLOWING.includes(input.relation ?? "none");
  return keys.map((key) => {
    const base = { key, ...MENU[key] };
    // The follow row is a TOGGLE, so it names the thing pressing it will do.
    if (key === "follow" && following) return { ...base, labelKey: "feed.menu.unfollow" };
    // Reporting a POST reports that post. On a derived session/PR row there is
    // no content row to file against — what you are reporting is the athlete —
    // so the label says so rather than pointing at a "post" that isn't one.
    if (key === "report" && input.subjectType !== "post") return { ...base, labelKey: "feed.menu.reportAuthor" };
    return base;
  });
}

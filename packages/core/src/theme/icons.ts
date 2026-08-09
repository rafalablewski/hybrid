/**
 * AURORA ICON SET — the line-icon glyphs used by the Aurora template, sourced
 * from the uploaded design kit (icons1/2/3). This file is the single source of
 * truth for WHICH icons exist (the `AuroraIconName` union) and their vector path
 * data (72×72 viewBox, stroke-based).
 *
 * Web renders these as inline <svg> with stroke=currentColor (see
 * apps/web/components/aurora/icons.tsx). Mobile renders them as true vectors
 * via react-native-svg (see apps/mobile/components/aurora/icons.tsx), so both
 * clients stroke the SAME path data at the SAME `auroraIconStroke(size)`
 * weight. The 216px PNGs in apps/mobile/assets/icons survive only for the
 * native tab bar's Android fallback.
 */
export type AuroraIconName =
  | "back"
  | "mail"
  | "lock"
  | "eye"
  | "user"
  | "search"
  | "bell"
  | "calendar"
  | "check"
  | "verified"
  | "chevron-down"
  | "arrow-up"
  | "location"
  | "navigation"
  | "play"
  | "heart"
  | "add"
  | "logout"
  | "settings"
  | "share"
  | "bookmark"
  | "list-check"
  | "list-play"
  | "list-add"
  | "calendar-event"
  | "user-circle"
  | "user-add"
  | "store"
  | "globe"
  | "swap"
  | "village"
  | "gps"
  | "info"
  | "offer"
  | "add-square"
  | "check-circle"
  | "user-square"
  | "download"
  | "copy"
  | "edit"
  | "grid"
  | "fork-knife"
  | "trophy"
  | "flame"
  | "bolt"
  | "stopwatch"
  | "moon";

/** Stroke weight (in 72-viewBox units) for a rendered icon size, so optical
 *  weight stays constant: small glyphs draw heavier, large draw lighter.
 *  THE one size→stroke rule for both clients. */
export function auroraIconStroke(size: number): number {
  if (size <= 14) return 5.5;
  if (size <= 18) return 4.5;
  if (size <= 24) return 3.5;
  return 3;
}

/** name → one or more SVG path `d` strings (72×72 viewBox, fill:none stroke). */
export const AURORA_ICON_PATHS: Record<AuroraIconName, string[]> = {
  back: ["M33 54L15 36L33 18M15 36H57"],
  mail: [
    "M9 24L32.6718 39.7812C34.6872 41.1248 37.3128 41.1248 39.3282 39.7812L63 24M15 57H57C60.3137 57 63 54.3137 63 51V21C63 17.6863 60.3137 15 57 15H15C11.6863 15 9 17.6863 9 21V51C9 54.3137 11.6863 57 15 57Z",
  ],
  lock: [
    "M36 42V48M24 27V18C24 11.3726 29.3726 6 36 6C42.6274 6 48 11.3726 48 18V27M21 63H51C54.3137 63 57 60.3137 57 57V33C57 29.6863 54.3137 27 51 27H21C17.6863 27 15 29.6863 15 33V57C15 60.3137 17.6863 63 21 63Z",
  ],
  eye: [
    "M63.0019 36.0022C57.7608 46.7301 47.6336 54 35.9999 54M35.9999 54C24.3661 54 14.2389 46.7301 8.99931 36.0009M35.9999 54L35.9999 63.0001M58.2654 43.2657L64.4998 49.5001M48.6913 50.9063L52.4999 58.5M13.7344 43.2657L7.5 49.5001M23.3086 50.9063L19.5 58.5001",
  ],
  user: [
    "M51 60C54.3137 60 57.1363 57.2698 56.3852 54.0424C54.5169 46.0141 48.269 42 36 42C23.731 42 17.4831 46.0141 15.6148 54.0424C14.8637 57.2698 17.6863 60 21 60H51Z",
    "M36 33C42 33 45 30 45 22.5C45 15 42 12 36 12C30 12 27 15 27 22.5C27 30 30 33 36 33Z",
  ],
  search: [
    "M40.1673 40.1673L57 57M28.5 45C37.6127 45 45 37.6127 45 28.5C45 19.3873 37.6127 12 28.5 12C19.3873 12 12 19.3873 12 28.5C12 37.6127 19.3873 45 28.5 45Z",
  ],
  bell: [
    "M36 16.5C44.2843 16.5 51 23.2157 51 31.5V38.2188C51 39.6883 51.5393 41.1067 52.5155 42.205L56.3425 46.5104C58.9221 49.4124 56.862 54 52.9792 54H19.0208C15.1379 54 13.0778 49.4124 15.6574 46.5104L19.4844 42.205C20.4607 41.1067 21 39.6883 21 38.2188L21 31.5C21 23.2157 27.7157 16.5 36 16.5ZM36 16.5V9M33 63H39",
  ],
  calendar: [
    "M60 27H12M21 9V15M51 9V15M18 63H54C57.3137 63 60 60.3137 60 57V21C60 17.6863 57.3137 15 54 15H18C14.6863 15 12 17.6863 12 21V57C12 60.3137 14.6863 63 18 63Z",
  ],
  // A bare tick — the circled variant lives at `check-circle` (the two used to
  // ship identical path data; now `check` is the mark alone).
  check: ["M13.5 39L28.5 54L58.5 19.5"],
  verified: [
    "M45 30L33 42L27 36M12 15V36.1672C12 45.2577 17.1361 53.568 25.2669 57.6334L36 63L46.7331 57.6334C54.8639 53.568 60 45.2577 60 36.1672V15L57.909 15.2323C50.5627 16.0486 43.1737 14.1241 37.1589 9.82782L36 9L34.8411 9.82782C28.8263 14.1241 21.4373 16.0486 14.091 15.2323L12 15Z",
  ],
  "chevron-down": ["M18 27L33.8787 42.8787C35.0503 44.0503 36.9497 44.0503 38.1213 42.8787L54 27"],
  "arrow-up": ["M36 57V15M54 33L36 15L18 33"],
  location: [
    "M22.1275 14.5775C25.9665 10.8591 30.5906 9 36 9C41.4094 9 46.0117 10.838 49.807 14.5141C53.6024 18.1902 55.5 22.6479 55.5 27.8873C55.5 30.5071 54.8238 33.507 53.4715 36.8873C52.1191 40.2676 50.4832 43.4366 48.5638 46.3944C46.6443 49.3521 44.7467 52.1197 42.8708 54.6972C40.995 57.2747 39.4027 59.3239 38.094 60.8451L36 63C35.4765 62.4084 34.7785 61.6268 33.906 60.6549C33.0336 59.6831 31.4631 57.7395 29.1946 54.8239C26.9262 51.9084 24.9413 49.0775 23.2399 46.331C21.5386 43.5845 19.9899 40.4789 18.594 37.0141C17.198 33.5493 16.5 30.5071 16.5 27.8873C16.5 22.6479 18.3758 18.2113 22.1275 14.5775Z",
    "M39 28.5C39 30.1569 37.6569 31.5 36 31.5C34.3431 31.5 33 30.1569 33 28.5C33 26.8431 34.3431 25.5 36 25.5C37.6569 25.5 39 26.8431 39 28.5Z",
  ],
  navigation: [
    "M34.577 10.2691C35.0328 8.90152 36.9672 8.90153 37.423 10.2691L52.8548 56.5645C53.2774 57.8323 51.9563 58.9781 50.761 58.3805L36 51L21.239 58.3805C20.0437 58.9781 18.7226 57.8323 19.1452 56.5645L34.577 10.2691Z",
  ],
  // A plain play triangle — `list-play` is the list + small triangle (the two
  // used to ship identical path data).
  play: ["M25.5 13.5L58.5 36L25.5 58.5V13.5Z"],
  heart: [
    "M58.6066 16.3934C64.4644 22.2513 64.4644 31.7488 58.6066 37.6066L38.1213 58.0919C36.9497 59.2635 35.0502 59.2635 33.8786 58.0919L13.3934 37.6066C7.53553 31.7488 7.53553 22.2513 13.3934 16.3934C18.0504 11.7364 23.6717 10.3105 29.3438 13.0782C31.595 14.1767 34.5468 16.3934 36 19.2891C37.4531 16.3934 40.4049 14.1767 42.6562 13.0782C48.3283 10.3105 53.9496 11.7364 58.6066 16.3934Z",
  ],
  add: [
    "M36 24V48M48 36H24M36 63C50.9117 63 63 50.9117 63 36C63 21.0883 50.9117 9 36 9C21.0883 9 9 21.0883 9 36C9 50.9117 21.0883 63 36 63Z",
  ],
  logout: ["M42 60H18C14.6863 60 12 57.3137 12 54L12 18C12 14.6863 14.6863 12 18 12H42M30 36H63M54 27L63 36L54 45"],
  settings: [
    "M28.9561 13.6984C29.5661 10.9532 32.001 9 34.8132 9H37.1871C39.9993 9 42.4342 10.9532 43.0443 13.6984L43.6531 16.4381C45.6364 17.2146 47.4729 18.284 49.1092 19.5932L51.7918 18.7488C54.4743 17.9045 57.3832 19.0366 58.7893 21.472L59.9763 23.5279C61.3824 25.9634 60.9083 29.0486 58.8359 30.9496L56.7653 32.8488C56.92 33.8767 57.0002 34.929 57.0002 36C57.0002 37.071 56.92 38.1233 56.7653 39.1511L58.8359 41.0504C60.9084 42.9514 61.3824 46.0366 59.9763 48.4721L58.7894 50.5279C57.3833 52.9634 54.4743 54.0954 51.7918 53.2512L49.1093 52.4068C47.4729 53.716 45.6364 54.7854 43.6531 55.5619L43.0443 58.3016C42.4342 61.0468 39.9993 63 37.1871 63H34.8132C32.001 63 29.5661 61.0468 28.9561 58.3016L28.3473 55.5619C26.3639 54.7854 24.5274 53.716 22.891 52.4068L20.2084 53.2511C17.526 54.0954 14.617 52.9634 13.2109 50.5279L12.0239 48.472C10.6179 46.0366 11.0919 42.9513 13.1643 41.0504L15.235 39.1511C15.0803 38.1232 15.0002 37.071 15.0002 36C15.0002 34.929 15.0803 33.8767 15.235 32.8489L13.1644 30.9496C11.092 29.0486 10.6179 25.9634 12.024 23.5279L13.211 21.4721C14.6171 19.0366 17.526 17.9046 20.2085 18.7488L22.891 19.5932C24.5274 18.284 26.3639 17.2146 28.3473 16.4381L28.9561 13.6984Z",
    "M39 36C39 37.6569 37.6569 39 36 39C34.3432 39 33 37.6569 33 36C33 34.3431 34.3432 33 36 33C37.6569 33 39 34.3431 39 36Z",
  ],
  share: ["M24 21L36 9L48 21M36 9V48M60 39V54C60 57.3137 57.3137 60 54 60H18C14.6863 60 12 57.3137 12 54L12 39"],
  bookmark: ["M18 18C18 14.6863 20.6863 12 24 12H48C51.3137 12 54 14.6863 54 18V56.1803C54 58.7906 50.897 60.1556 48.9728 58.3918L36 46.5L23.0272 58.3918C21.103 60.1556 18 58.7906 18 56.1803V18Z"],
  "list-check": ["M9 33H39M9 21H39M9 45H27M38.7944 45.9943L46.4788 53.6787C47.6503 54.8502 49.5498 54.8502 50.7214 53.6787L64.923 39.4771"],
  "list-play": ["M15 33H45M15 21H45M15 45H33M45 45V57L57 51L45 45Z"],
  "list-add": ["M51 57V33M9 33H39M9 21H39M9 45H27M39 45H63"],
  "calendar-event": ["M60 27H12M21 9V15M51 9V15M48 46.5C48 48.9853 45.9853 51 43.5 51C41.0147 51 39 48.9853 39 46.5C39 44.0147 41.0147 42 43.5 42C45.9853 42 48 44.0147 48 46.5ZM18 63H54C57.3137 63 60 60.3137 60 57V21C60 17.6863 57.3137 15 54 15H18C14.6863 15 12 17.6863 12 21V57C12 60.3137 14.6863 63 18 63Z"],
  "user-circle": ["M54 56.125C52.4497 49.125 46.607 45 36.0004 45C25.3938 45 19.5503 49.125 18 56.125M36 63C50.9117 63 63 50.9117 63 36C63 21.0883 50.9117 9 36 9C21.0883 9 9 21.0883 9 36C9 50.9117 21.0883 63 36 63ZM36 36C40 36 42 33.8571 42 28.5C42 23.1429 40 21 36 21C32 21 30 23.1429 30 28.5C30 33.8571 32 36 36 36Z"],
  "user-add": ["M9 33H24M16.5 40.5V25.5M43.5 42C54.8899 42 60.6914 46.0121 62.4279 54.0364C63.1287 57.2751 60.3137 60 57 60H30C26.6863 60 23.8713 57.2752 24.5721 54.0364C26.3086 46.0121 32.1101 42 43.5 42ZM43.5 30C48.5 30 51 27.4286 51 21C51 14.5714 48.5 12 43.5 12C38.5 12 36 14.5714 36 21C36 27.4286 38.5 30 43.5 30Z"],
  store: ["M60 34.8633V54C60 57.3137 57.3137 60 54 60H18C14.6863 60 12 57.3137 12 54V34.8633M48 12L49.5 29.25C49.5 32.9779 52.5221 36 56.25 36C59.7181 36 62.5753 33.3845 62.9567 30.0185C63.0143 29.5107 62.9347 28.9997 62.8057 28.5052L59.6701 16.4855C58.9809 13.8435 56.5948 12 53.8644 12H18.1356C15.4052 12 13.0191 13.8435 12.3299 16.4855L9.1943 28.5052C9.06529 28.9997 8.98572 29.5107 9.04326 30.0185C9.42472 33.3845 12.2819 36 15.75 36C19.4779 36 22.5 32.9779 22.5 29.25M24 12L22.5 29.25C22.5 32.9779 25.5221 36 29.25 36C32.9779 36 36 32.9779 36 29.25M36 29.25C36 32.9779 39.0221 36 42.75 36C46.4779 36 49.5 32.9779 49.5 29.25M36 29.25V12"],
  globe: ["M36 63C50.9117 63 63 50.9117 63 36C63 21.0883 50.9117 9 36 9M36 63C21.0883 63 9 50.9117 9 36C9 21.0883 21.0883 9 36 9M36 63C28.3953 55.1698 24 45.9154 24 36C24 26.0846 28.3953 16.8302 36 9M36 63C43.6047 55.1698 48 45.9154 48 36C48 26.0846 43.6047 16.8302 36 9M60 27H12M60 45H12"],
  swap: ["M18 39L9 48L18 57M9 48H33C37.9706 48 42 43.9706 42 39V36M30 36V33C30 28.0294 34.0294 24 39 24H63M54 15L63 24L54 33"],
  village: ["M27 59.9999L42 59.9997V29.485C42 27.8937 41.3679 26.3676 40.2426 25.2424L31.2426 16.2424C28.8995 13.8992 25.1005 13.8992 22.7574 16.2424L13.7574 25.2424C12.6321 26.3676 12 27.8937 12 29.485V53.9998C12 57.3135 14.6863 59.9998 17.9999 59.9998L27 59.9999ZM42 59.9997L57 59.9998C60.3137 59.9999 63 57.3136 63 53.9998V38.4852C63 36.8939 62.3679 35.3678 61.2426 34.2425L55.2426 28.2425C52.8995 25.8994 49.1005 25.8994 46.7574 28.2425L42 32.9999M27 59.9999V47.9999"],
  gps: ["M36 60C49.2548 60 60 49.2548 60 36M36 60C22.7452 60 12 49.2548 12 36M36 60V66M60 36C60 22.7452 49.2548 12 36 12M60 36H66M36 12C22.7452 12 12 22.7452 12 36M36 12V6M12 36H6"],
  info: ["M36 24V25.5M36 36V48M36 63C50.9117 63 63 50.9117 63 36C63 21.0883 50.9117 9 36 9C21.0883 9 9 21.0883 9 36C9 50.9117 21.0883 63 36 63Z"],
  offer: ["M24 24H24.03M34.7574 13.7574L58.7574 37.7574C61.1005 40.1005 61.1005 43.8995 58.7574 46.2426L46.2426 58.7574C43.8995 61.1005 40.1005 61.1005 37.7574 58.7574L13.7574 34.7574C12.6321 33.6321 12 32.106 12 30.5147V18C12 14.6863 14.6863 12 18 12H30.5147C32.106 12 33.6321 12.6321 34.7574 13.7574Z"],
  "add-square": ["M36 24V48M48 36H24M18 60H54C57.3137 60 60 57.3137 60 54V18C60 14.6863 57.3137 12 54 12H18C14.6863 12 12 14.6863 12 18V54C12 57.3137 14.6863 60 18 60Z"],
  "check-circle": [
    "M46.5 28.5L32.25 44.25L25.5 37.5",
    "M36 63C50.9117 63 63 50.9117 63 36C63 21.0883 50.9117 9 36 9C21.0883 9 9 21.0883 9 36C9 50.9117 21.0883 63 36 63Z",
  ],
  "user-square": ["M18.2197 60C19.3225 52 24.6614 48 36.0004 48C47.3393 48 52.6782 52 53.781 60M36 39C40 39 42 36.8571 42 31.5C42 26.1429 40 24 36 24C32 24 30 26.1429 30 31.5C30 36.8571 32 39 36 39ZM18 60H54C57.3137 60 60 57.3137 60 54V18C60 14.6863 57.3137 12 54 12H18C14.6863 12 12 14.6863 12 18V54C12 57.3137 14.6863 60 18 60Z"],
  download: ["M21 36L36 51L51 36M36 51V12M51 60H21"],
  copy: ["M9 48V12C9 8.68629 11.6863 6 15 6H45M27 66H54C57.3137 66 60 63.3137 60 60V24C60 20.6863 57.3137 18 54 18H27C23.6863 18 21 20.6863 21 24V60C21 63.3137 23.6863 66 27 66Z"],
  // Pencil / "edit profile" — distinct from the `settings` gear so the two
  // aren't confused next to an avatar. Kept in lockstep with the mobile PNG.
  // A 2x2 rounded-square springboard grid — the "More / everything else" hub
  // glyph, deliberately distinct from the settings cog.
  grid: [
    "M16 12h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z",
    "M44 12h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z",
    "M16 40h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V44a4 4 0 0 1 4-4z",
    "M44 40h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4V44a4 4 0 0 1 4-4z",
  ],
  edit: ["M51 9L63 21L22.5 61.5L6 66L10.5 49.5Z", "M44 16L56 28"],
  // Fork + knife — the NUTRITION glyph, and a bottom-nav destination since Fuel
  // took the Explore slot. The same cutlery the Fuel widget's PlateGlyph draws
  // at 24×24 (aurora/fuel.tsx), redrawn in the kit's 72×72 stroke box so it
  // carries identical optical weight beside village/grid in the bar.
  "fork-knife": [
    "M13.5 9V30C13.5 36.6274 18.8726 42 25.5 42C32.1274 42 37.5 36.6274 37.5 30V9",
    "M25.5 9V63",
    "M52.5 9C48 13.5 46.5 21 46.5 30C46.5 39 48 42 52.5 42C57 42 58.5 39 58.5 30C58.5 21 57 13.5 52.5 9Z",
    "M52.5 42V63",
  ],
  // Semantic marks drawn in the kit's house style (72×72, stroke-only, round
  // caps). Vector-only on both clients — no PNG twin needed.
  // stopwatch + moon complete the wrapped device-ad pictograph set (heart-rate,
  // flame, stopwatch, sleep) so that grid can drop its last emoji.
  stopwatch: ["M36 24V40L45 46", "M36 18C25 18 16 27 16 38C16 49 25 58 36 58C47 58 56 49 56 38C56 27 47 18 36 18Z", "M30 12H42"],
  moon: ["M46.5 15C41 17.5 37 23 37 29.5C37 38.5 44.5 46 53.5 46C55.8 46 58 45.5 60 44.6C57.4 53.7 49 60 39.5 60C27.6 60 18 50.4 18 38.5C18 27 26.8 17.6 38 16.1C40.7 15.7 43.6 15.2 46.5 15Z"],
  trophy: [
    "M24 12H48V27C48 35.2843 42.6274 42 36 42C29.3726 42 24 35.2843 24 27V12Z",
    "M24 16.5H13.5V21C13.5 27.6274 18.3726 33 24 33M48 16.5H58.5V21C58.5 27.6274 53.6274 33 48 33",
    "M36 42V51M28.5 51H43.5L46.5 60H25.5Z",
  ],
  flame: [
    "M36 9C42 18 51 26 51 41C51 53 44.2843 63 36 63C27.7157 63 21 53 21 41C21 32 24.75 26.25 28.5 22.5C28.5 28.5 31.5 32 35 32C33 26 33 17 36 9Z",
  ],
  bolt: ["M40.5 9L18 40.5H33L31.5 63L54 31.5H39L40.5 9Z"],
};

/**
 * NUTRITION glyphs — a small, purpose-built extension of the Aurora line set
 * for the Nutrition surface (meal times, water, scan/voice, the calorie ring
 * accent). Same 72×72 stroke convention as AURORA_ICON_PATHS so the renderers
 * are identical; kept SEPARATE from AuroraIconName because these have no
 * design-kit PNG (they render as true vectors on both clients — inline <svg> on
 * web, react-native-svg on mobile). This is how the Nutrition redesign speaks
 * ONE monoline icon language and never falls back to an emoji.
 */
export type NutritionGlyphName =
  | "sunrise" | "sun" | "moon" | "cup" | "bowl"
  | "water" | "scan" | "mic" | "spark" | "target" | "chevron"
  // the Nutrition hub bento's five destinations (nutrition-hub.ts)
  | "diary" | "chart" | "scale" | "box";

export const NUTRITION_GLYPHS: Record<NutritionGlyphName, string[]> = {
  // morning — sun over a horizon with three short rays
  sunrise: ["M12 54 L60 54", "M22 54 a14 14 0 0 1 28 0", "M36 24 L36 32", "M18 33 L23 38", "M54 33 L49 38"],
  // midday — full sun, eight rays
  sun: [
    "M23 36 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0",
    "M36 9 L36 17", "M36 55 L36 63", "M9 36 L17 36", "M55 36 L63 36",
    "M16.9 16.9 L22.6 22.6", "M55.1 55.1 L49.4 49.4", "M55.1 16.9 L49.4 22.6", "M16.9 55.1 L22.6 49.4",
  ],
  // evening — crescent moon
  moon: ["M46 12 A26 26 0 1 0 46 60 A20 20 0 1 1 46 12 Z"],
  // between meals — a mug with steam
  cup: ["M18 26 L54 26 L50 52 a6 6 0 0 1 -6 5 L28 57 a6 6 0 0 1 -6 -5 Z", "M54 31 a8 8 0 0 1 0 15", "M30 12 q4 5 0 9", "M42 12 q4 5 0 9"],
  // generic meal — a bowl with rising steam
  bowl: ["M13 33 L59 33 a23 17 0 0 1 -46 0 Z", "M28 22 q4 -6 0 -10", "M40 24 q4 -6 0 -10"],
  // water — a droplet
  water: ["M36 12 C48 30 52 38 52 46 a16 16 0 0 1 -32 0 C20 38 24 30 36 12 Z"],
  // scan — a viewfinder with a scan line
  scan: [
    "M14 26 L14 18 a4 4 0 0 1 4 -4 L26 14", "M46 14 L54 14 a4 4 0 0 1 4 4 L58 26",
    "M58 46 L58 54 a4 4 0 0 1 -4 4 L46 58", "M26 58 L18 58 a4 4 0 0 1 -4 -4 L14 46", "M12 36 L60 36",
  ],
  // voice — a microphone
  mic: ["M27 12 a9 9 0 0 1 18 0 L45 34 a9 9 0 0 1 -18 0 Z", "M18 33 a18 18 0 0 0 36 0", "M36 51 L36 62", "M27 62 L45 62"],
  // a four-point sparkle — the coach nudge / AI insight mark
  spark: ["M36 10 C38 26 46 34 62 36 C46 38 38 46 36 62 C34 46 26 38 10 36 C26 34 34 26 36 10 Z"],
  // concentric target — echoes the calorie ring
  target: ["M9 36 a27 27 0 1 0 54 0 a27 27 0 1 0 -54 0", "M25 36 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0"],
  // right chevron
  chevron: ["M28 20 L44 36 L28 52"],
  // DIARY — a bound book: spine on the left, three ruled lines. Distinct from
  // the kit's `list-check`, which means "a checklist", not "the day's record".
  diary: [
    "M14 18 a4 4 0 0 1 4 -4 L54 14 a4 4 0 0 1 4 4 L58 54 a4 4 0 0 1 -4 4 L18 58 a4 4 0 0 1 -4 -4 Z",
    "M25 14 L25 58", "M33 26 L49 26", "M33 36 L49 36", "M33 46 L43 46",
  ],
  // INSIGHTS — an axis with a rising trend line. The kit has no chart mark, and
  // `arrow-up` reads as "upload" once it sits in a row of nouns.
  chart: ["M13 13 L13 59 L59 59", "M22 47 L33 35 L42 42 L58 23"],
  // BODY & WEIGHT — a bathroom scale: the platform, the dial arc and its needle.
  scale: [
    "M13 20 a6 6 0 0 1 6 -6 L53 14 a6 6 0 0 1 6 6 L59 52 a6 6 0 0 1 -6 6 L19 58 a6 6 0 0 1 -6 -6 Z",
    "M25 46 a11 11 0 0 1 22 0", "M36 46 L36 33",
  ],
  // YOUR PRODUCTS — a carton seen in three-quarter, the universal "packaged
  // food" mark, and the one shape that can't be confused with a saved meal.
  box: ["M36 11 L61 24 L61 48 L36 61 L11 48 L11 24 Z", "M11 24 L36 37 L61 24", "M36 37 L36 61"],
};

/**
 * TODAY HUB glyphs — the marks on Today's three pills (see today-tabs.ts).
 *
 * The pills carry GLYPHS, not words: "Dashboard", "Performance" and "Feed" are
 * three very different lengths, so as text in three equal segments they sit
 * visibly off-centre from one another and the control reads as misaligned.
 * Three marks of matched optical weight do not have that problem, and the words
 * survive as each tab's accessible name (labelKey) rather than disappearing.
 *
 * Purpose-built for the same reason NUTRITION_GLYPHS above is: the design kit
 * is a generic UI set with no chart or community mark (its own comment says so),
 * and the alternative — an emoji — would be the one place in the app that breaks
 * the monoline voice AND would render as a different picture on every platform.
 * Same 72×72 stroke convention as AURORA_ICON_PATHS, so they carry identical
 * weight beside the kit icons; no PNG needed, since both clients draw these as
 * true vectors (inline <svg> on web, react-native-svg on mobile).
 */
export type HubGlyphName = "dashboard" | "performance" | "feed";

export const HUB_GLYPHS: Record<HubGlyphName, string[]> = {
  // DASHBOARD — a bento: one tall panel and two stacked beside it. The literal
  // shape of the daily loop (the plan hero, then the smaller cards under it),
  // and distinct from the kit's plain 2×2 `grid`, which means "all apps".
  dashboard: [
    "M12 16a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z",
    "M42 16a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H46a4 4 0 0 1-4-4z",
    "M42 46a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H46a4 4 0 0 1-4-4z",
  ],
  // PERFORMANCE — three rising bars on a baseline. The kit has no chart glyph;
  // `arrow-up` (what the nav borrows for every trend metric) reads as "upload"
  // once it sits beside a bento and a pair of figures.
  performance: ["M12 58H60", "M23 58V40", "M36 58V28", "M49 58V14"],
  // FEED — two figures, the second half-behind the first. People, not posts:
  // the tab is who you follow, and a card stack would only repeat the bento.
  feed: [
    "M50 31a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z",
    "M46 40c8 0 14 5 14 14",
    "M30 35a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19Z",
    "M13 59c0-10 7.5-16 17-16s17 6 17 16",
  ],
};

/**
 * AURORA nav glyphs — maps EVERY NAV_ITEMS id to a design-kit line icon (icons1/
 * 2/3), so the Aurora nav uses ONLY the uploaded icon set — never a unicode or
 * emoji glyph. The kit is a generic UI set with no fitness/chart glyphs, so a
 * few items reuse the closest available icon (e.g. arrow-up for the trend-y
 * metrics); that's deliberate, to honour the "only our icons" rule. Classic
 * always uses the NAV_ITEMS glyph.
 */
export const AURORA_NAV_ICONS: Record<string, AuroraIconName> = {
  today: "village",
  notifications: "bell",
  log: "list-add",
  timer: "play",
  runtrack: "gps",
  calendar: "calendar",
  builder: "add-square",
  plans: "bookmark",
  periodize: "calendar-event",
  sport: "navigation",
  competition: "offer",
  statistics: "arrow-up",
  performance: "arrow-up", // the home-group state hub (ex-Cockpit) — trend-y metric icon, matching the mobile tab glyph
  analytics: "info",
  volume: "list-check",
  exercises: "list-play",
  trends: "arrow-up",
  velocity: "arrow-up",
  running: "location",
  endurance: "gps",
  forceplate: "download",
  video: "list-play",
  history: "copy",
  checkin: "check",
  nutrition: "fork-knife",
  progress: "user-square",
  longevity: "heart",
  coach: "user",
  squad: "user-add",
  teamcompare: "swap",
  org: "globe",
  talent: "verified",
  tactical: "navigation",
  profile: "user-circle",
  connections: "share",
  settings: "settings",
  // Support — the kit has no life-ring/question glyph, and `info` is already
  // the "explain this" mark everywhere else in the app.
  help: "info",
  upgrade: "offer",
  // social + marketplace
  feed: "list-play",
  // Direct messages — the envelope, the same mark the bottom bar draws.
  messages: "mail",
  discover: "user-add",
  // The same glyph the feed row's bookmark draws — the affordance link matters
  // more than uniqueness here, and this map already reuses glyphs across groups
  // (arrow-up four times, list-play three).
  saved: "bookmark",
  leaderboard: "arrow-up",
  coaches: "store",
  myprofile: "user-circle",
};

/**
 * The Train glyph — a dumbbell, drawn in the same 72×72 stroke box as the kit
 * icons so it carries identical optical weight beside village/globe/grid in the
 * bottom nav.
 *
 * Deliberately NOT a member of `AuroraIconName`: it is rendered inline as a
 * vector by both nav components, so it needs no entry in the shared map.
 */
export const AURORA_TRAIN_GLYPH = "M12 27v18M21 21v30M51 21v30M60 27v18M21 36h30";

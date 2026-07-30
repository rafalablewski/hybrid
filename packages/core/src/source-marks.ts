/**
 * Source marks — the brand artwork we display beside a HYBRID Verified item.
 *
 * ONE PLACE for every third-party mark in the app, so what we show and on what
 * terms is enumerable rather than scattered (`sourceMarkCredits()` reads from
 * here via the catalog). Each mark is SELF-CONTAINED inline SVG: no remote
 * reference, no `<image>`, no webfont. A remote logo would break offline —
 * exactly when the athlete is standing in the restaurant on bad signal — hotlink
 * someone else's bandwidth, and leak a request every time a food is opened.
 * `auditVerifiedCatalog()` enforces all of that, in the test suite.
 *
 * WHAT A MARK CLAIMS: whose food this is. Nothing more. It renders under a
 * "Nutrition data published by" label, above a divider, with the HYBRID ✓ and
 * the trademark line kept separate below — attribution, never an endorsement.
 * See reference/verified-source-marks.md.
 */

import type { SourceMark } from "./verified-foods";

/**
 * MAX (Max Burgers AB) — the wordmark, traced to vector paths from the
 * operator's own artwork. ONE path with `fill-rule="evenodd"`, so the white
 * keylines between the letterforms are true holes rather than painted white shapes:
 * they take the colour of whatever the mark sits on, which is what keeps it
 * legible on BOTH the AURORA charcoal card and the Kyoto Hour washi one.
 */
export const MAX_MARK: SourceMark = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 627.6" role="img" aria-label="MAX"><path fill="#ED1B24" fill-rule="evenodd" d="M323.9 627.2L277.8 627L277.7 540.3L277.6 453.6L243 496.2C223.9 519.7 208.3 538.9 208.1 538.9C208 538.9 191.7 519.8 171.9 496.5L135.9 454.1L135.8 540.5L135.7 627L67.8 627L0 627L0 409.2L0 191.3L63 191.5L126.1 191.6L166.6 249.2C188.8 280.9 207.4 307.2 207.7 307.7C208.3 308.6 212.7 301.4 242.8 250.2L277.2 191.6L292.4 191.4L307.7 191.1L311.3 182.7C335.4 127.2 380.2 73.5 440.2 28.4C452.3 19.3 481.1 0 482.5 0C483 -0 500.2 11.1 508.6 17C551.4 46.4 591.2 84.4 618.5 122.1C633 142 646 164.7 654.5 184.9L657.1 191.1L679.8 191.2L702.4 191.4L737.8 246.2C757.2 276.4 773.3 301.1 773.5 301.1C773.7 301.1 789.8 276.4 809.3 246.2L844.6 191.4L922.4 191.4L1000.2 191.4L999.8 195.5C999.7 197.8 999.2 200.6 998.9 201.6C998.5 202.7 968 250.3 931.2 307.6C894.3 364.8 864.2 411.9 864.2 412.2C864.2 412.5 893.2 457.5 928.6 512.2C964.1 566.9 993.6 612.6 994.1 613.8C994.9 615.4 995.1 617.3 995.1 621.5L995.1 627L920.5 626.9L845.8 626.8L809.9 571.1C790.2 540.5 773.9 515.3 773.6 515.3C773.4 515.2 756.9 540.3 737.1 571.1L700.9 627L618.6 627L536.2 627L536.2 559.7L536.2 492.4L482.4 492.4L428.6 492.4L428.6 559.7L428.6 627L407.7 627C396.2 627 383 627.1 378.4 627.2C373.8 627.3 349.3 627.3 323.9 627.2ZM679.7 425.5L688.8 412L680 399.9C675.1 393.3 671 387.6 670.7 387.3C670.5 387 670.3 398.5 670.3 412.9C670.3 427.2 670.3 438.9 670.4 438.9C670.5 438.9 674.7 432.9 679.7 425.5ZM957.9 374.6C956.6 374.3 954 373.4 952.2 372.5C934.7 364.3 934.5 339.2 951.7 330.6C955.7 328.6 959 328 964.2 328.2C970.3 328.5 974.9 330.5 979.1 334.8C984 339.6 986.1 344.8 986 351.9C986 358.7 983.5 364.2 978.2 369C975.1 371.9 972.1 373.4 967.6 374.4C963.7 375.2 961.4 375.2 957.9 374.6ZM971.1 369.6C974.4 367.9 978.6 363.5 980 360.4C984.6 350.1 980.6 338.1 970.9 333.4C967.7 331.8 966.9 331.6 962.4 331.6C958.2 331.6 957.2 331.8 954.4 333.2C950.3 335.2 946.8 338.7 945 342.6C943.7 345.3 943.5 346.3 943.5 351.4C943.5 356.3 943.7 357.4 944.9 360C946.6 363.6 949.2 366.7 952.1 368.5C955.9 370.9 957.8 371.3 963.2 371.2C967.5 371 968.8 370.8 971.1 369.6ZM536.6 354.7C534.9 297 528 260.9 512.5 228.4C505.8 214.5 494.3 197.2 484.4 186.5L482.2 184.1L479.7 186.8C457.9 210.5 443.9 237 436.5 268.4C431.3 290 428.1 324.1 428.1 356.9L428.1 367.6L482.5 367.6L536.9 367.6L536.6 354.7ZM953.5 351.7L953.5 337.8L960.6 337.8C971.1 337.8 973.2 339.1 973.2 345.4C973.2 348.6 973.1 349.3 972 350.5C971.2 351.2 969.7 352.2 968.6 352.5L966.5 353.2L970.3 359C972.4 362.2 974.1 365 974.1 365.1C974.1 365.3 973.1 365.4 971.9 365.4C969.8 365.4 969.8 365.4 966.1 359.5L962.4 353.6L960.2 353.5L957.9 353.5L957.7 359.3L957.6 365.1L955.5 365.3L953.5 365.5L953.5 351.7ZM967.8 348.6C968.9 347.8 969.2 347 969.2 345.4C969.2 342.2 967.8 341.4 962.4 341.2L957.8 341L957.8 345.3L957.8 349.7L962.1 349.7C965.6 349.7 966.6 349.5 967.8 348.6Z"/></svg>`,
  aspect: 1.5934, // 1000 / 627.6
  alt: "MAX",
  credit:
    "Vector trace of the MAX wordmark, from artwork supplied by the HYBRID team (2026-07-29). " +
    "MAX is a registered trademark of Max Burgers AB; confirm redistribution terms with the " +
    "operator before a public release.",
};

/**
 * Lidl (Lidl Stiftung & Co. KG) — the roundel.
 *
 * WHERE THE GEOMETRY CAME FROM. Not traced by us: it is the Lidl glyph from the
 * simple-icons project, whose artwork is released CC0-1.0. Every coordinate
 * below is that file's, unaltered — nothing here is a hand-drawn approximation
 * of a real brand mark, which reference/verified-source-marks.md rules out for
 * exactly the reason it should.
 *
 * WHAT WE CHANGED, AND WHY. simple-icons ships one MONOCHROME path: the square
 * as a hairline frame, the circle as a ring, the wordmark as filled letters.
 * Rendered in a single colour it is not the mark an athlete recognises on a
 * bread bag — and a mark that isn't recognised at a glance is doing none of the
 * job the provenance card added it for. So the one path is split at its
 * subpath boundaries and each part takes its published brand colour — blue
 * #0050AA, yellow #FFF000, red #E60A14 — with the square filled rather than
 * outlined and the ring laid over the disc, which is the logo's real
 * construction. Coordinates untouched; only `fill` and `fill-rule` are ours.
 *
 * Unlike MAX's, this mark is a SOLID BADGE rather than knockouts, so it carries
 * its own ground: it reads identically on the AURORA charcoal card and the
 * Kyoto Hour washi one without depending on either.
 */
export const LIDL_MARK: SourceMark = {
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Lidl"><path fill="#0050AA" d="M0 0v24h24V0z"/><path fill="#FFF000" d="M11.998.834C5.83.834.83 5.834.83 12.002c0 6.168 5 11.168 11.168 11.168 6.167 0 11.167-5 11.168-11.166C23.165 5.837 18.166.837 12 .834z"/><path fill="#E60A14" fill-rule="evenodd" d="M11.998.834C5.83.834.83 5.834.83 12.002c0 6.168 5 11.168 11.168 11.168 6.167 0 11.167-5 11.168-11.166C23.165 5.837 18.166.837 12 .834zM12 1.543c5.777 0 10.46 4.682 10.46 10.459v.004c-.004 5.773-4.686 10.452-10.46 10.453-5.777 0-10.46-4.68-10.46-10.457C1.54 6.225 6.222 1.543 12 1.543z"/><path fill="#0050AA" fill-rule="evenodd" d="M9.229 7.85c-.645 0-1.166.521-1.166 1.166v.004c0 1.044 1.261 1.567 1.999.829.738-.738.215-2-.829-1.999zM2.73 10.059v.71h.551v2.465h-.55v.713h4.644v-.65l.537-.54 1.486 1.491-.55.547.357.36 2.973-2.977v-.713l-.826.83-1.848-1.848-2.129 2.133v-.576l-1.904 1.06V10.77h.549v-.711zM11.635 10.059v.71h.549v2.465h-.555v.713h3.129c2.325 0 2.355-3.888.008-3.888zM16.598 10.059v.71h.55v2.465h-.55v.713h4.648v-1.943l-1.906 1.06V10.77h.55v-.711zM14.168 11.269h.133c.687 0 .685 1.461.023 1.461h-.156v-1.46z"/></svg>`,
  aspect: 1, // 24 / 24 — the roundel is square
  alt: "Lidl",
  credit:
    "Lidl glyph from the simple-icons project (v16.27.1), released CC0-1.0. Geometry unaltered; " +
    "split into its subpaths and filled in Lidl's published brand colours by the HYBRID team " +
    "(2026-07-30). Lidl is a registered trademark of Lidl Stiftung & Co. KG; the CC0 waiver " +
    "covers copyright only, so confirm trademark use with the operator before a public release.",
};

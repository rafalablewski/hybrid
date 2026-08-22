// Branded gradient avatar presets — tiny 16×16 PNG data-URIs so they persist in
// the profile's avatarUrl field and render on BOTH clients through the existing
// <img>/<Image source={{uri}}> paths (no renderer changes, no Storage bucket).
// Kept comfortably under the server's 500-char avatarUrl cap (see the
// /api/social/profile PUT). A real photo upload is a separate, blocked
// capability (social-avatar-upload); these give people a non-default avatar today.

export interface AvatarPreset { id: string; uri: string; }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "lime", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAs0lEQVR42qXLUQYCABQEwJWSlKQkJUlJSlLSuSIiIhERERGJUkpEpJSSUkpJRCQiEhGJ6ATbId78D3a/KDffCFefMBfvEGevIKfPAMcPP4d3H/s3L3tXD7sXNztnF1snJxtHB2sHO6t7GyHJla2VkOTy2kJIcmlpJiS5ODcRklyYGQlJzk8MhCTnRnpCkrMDHSHJmb6WkOR0T0NIcqqrJiQ52VERkpxoKwlJjjcVhCTH6uAfdEl7nXAtYdYAAAAASUVORK5CYII=" },
  { id: "teal", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAuUlEQVR42qXLwYqBARgF0PsQkiRJkiSJNEmSJEmyl6QkaUIKiQkREkIk/TVloSyUslDKQlkoZaE80PUQ39kfxD8KY+8No681I88Vw48FQ/cZg7cpA9cx/ZcRfechvac+Pccefw4duvctunZ/dG4bhCQ7/uuEJNuVGiHJtnWFkGTrskxIsmVeIiTZPCkQkmwa/RKSbBzkCUk2dHOEJOvbWUKSdc0MIcnaepqQZE01RUiyupwkJFlVTPALIPJLH7U6QWIAAAAASUVORK5CYII=" },
  { id: "blue", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAuElEQVR42qXLsQYCABQF0Ps9SSJJkkSSpCKVJJVSiYaIhoiGiIaIhoiGiIboE5IkkSRJEkmSJEkkye0j3tkP0gMy1f8x0fsy3v0w2nkz3H4x1Hoy2Hww0LjTX7/RW7vSU73QXTnTWT7RUTrSXjwQkmwr7AlJtuZ3hCRbcltCks3ZDSHJpsyakGRjekVIsiG5JCRZH1sQkqyLzAlJ1oZmhCRrAlNCktW+CSHJKs+YkGSla0RIssIx5B+p1aahOOkeSQAAAABJRU5ErkJggg==" },
  { id: "violet", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAsklEQVR42qXLQQoBABQFwHcnpZRSSkkppZQiJUKkRCJEIkRKSkpKSm4ikkgiiUQSSSSRzXOIP/tBv/xjr/hlN/9hJ/tmO/1iK/lkM/5gI3pnPXJjLXRlNXhhxX9myXtiwX1kznlg1rEnJDlj2xGSnLJuCUlOWDaEJMfMa0KSo6YVIclh45KQ5JBhQUhyUD8nJDmgmxGS7NNOCUn2aCaEJLvUY0KSnaoRIckO5ZCQZLtiwD86KsAfLmw4ggAAAABJRU5ErkJggg==" },
  { id: "amber", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvElEQVR42qXL0WYCABgG0O85kokkSRLJJBlJkiQm6RFiRGSMMSIiIhIRIyIiERGplKQkZVKSlKRMSrr+eoj/3B88OiHeW0HemgFeG++81P38r/l4rnp5qnh4LLt5KLm4Lzq5+3VwW3jjJm/nOmfjKmslJHmZeSUkeZG2EJL8lzITkjxPmghJniWMhCRP4wZCkic/ekKSx986QpJHX1pCkoefGkKSBzE1Icn9qIqQ5F7khZDk7oeSkOR2WMEnd4ipGckFYRIAAAAASUVORK5CYII=" },
  { id: "coral", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAqUlEQVR42qXLawoBARgF0LsuJaWk1CBvk1cyyJswmpJSUnYnIiIiEhEREV2L+M7/Aw4M/votfns6P90m3506X+0an0aVD73Ce6PEW63AaznPSzHHcy7LUybNo6bxkEwRkryPJwlJ3kUThCRv1TghyZtgjJDktT9CSPLKoxKSvHSFCUleKCFCkueOACHJM7uPkOSpzUtI8sTqISR5bHETkjwyOwlJHpoU/gE62qyfV86+lgAAAABJRU5ErkJggg==" },
];

/** Is this avatarUrl one of our built-in gradient presets? */
export function isAvatarPreset(url: string | null | undefined): boolean {
  return !!url && AVATAR_PRESETS.some((p) => p.uri === url);
}

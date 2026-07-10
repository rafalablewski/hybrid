// Branded gradient avatar presets — tiny 28×28 PNG data-URIs so they persist in
// the profile's avatarUrl field and render on BOTH clients through the existing
// <img>/<Image source={{uri}}> paths (no renderer changes, no Storage bucket).
// A real photo upload is a separate, blocked capability (social-avatar-upload);
// these give people a non-default avatar today.

export interface AvatarPreset { id: string; uri: string; }

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "lime", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABJklEQVR42r3NiSoDAAAG4N993/d93/f1XCISiUhEIhKRxtqa3NcwxtraEhEREYmIiMgT/DzF/73Ah8PfOnp+aun+rqHrq5rOzyo6Piq5/15B+1s5d1/LaHsp5fZzCa1Pxdx8LOL6QyFX7wu4cpfPpds8Lt7kcv46h3NX2bRcZtF8kUnTeQaNZ+mcOU2j4SSV08cpnDpKJpTZ5OF/qMwmPEmEMht3JxLKbMyVQCizUWc8ocxGHHGEMhs+iCWU2ZA9hlBmg3vRhDIbsEURyqx/J5JQZn1bEYQy67WGE8qsZyOMUGbda6GEMutaDSGUWedyMKHMOpaCCGXWvhBIKLO2+QBCmbXO+RPKrMXiRyizZrMvocyaTD6EMms0ehPKrGHWi1Bm9QbwD4ICmp4uhS2GAAAAAElFTkSuQmCC" },
  { id: "teal", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABKElEQVR42r3N9yoEAAAG8O8hzOyVPbJX9sr8H5lZ2ecO53DOcfbhbBJJkkSSJJEkSSR5oM9bfL8X+KHmb5/Vv3us+tll5fc2K762WP65ybKPDZa+u1jyts7i11UWvThZ+LzCgqdl5j8uMe9hgbn388y5m2P2rYNZN7PMvLYz42qa6Zc2pl1MMfXcypSzSSafjjPpxMLE4zFCmSUcmQllFn84SiizuINhQpnF7pkIZRazYySUWfTWEKHMojYMhDKLdA0SyixirZ9QZuHOPkKZhS33EsosdLGHUGYh892EMgt2dBHKLGimk1BmgfYOQpkF2NoJZeZvbSOUmd9EK6HMfC0thDLzMTcTysx7pIlQZl6mRkKZeRobCGXmYagnlJn7QB2hzNz6avkPZBAGGqwBaGoAAAAASUVORK5CYII=" },
  { id: "blue", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABK0lEQVR42r3NhyoEABjA8e95kJmVlZnVOXTOdc5xRuckSSJJEkmSSJJIkkSSR0B2VnZWdlZ2Vvh7i+/3Aj9xTUDR+B/OsV8KR38oGPkmf/iLvKFPHIMf5A68Y+9/I7vvFVvvC1k9z1i7n7B0PZLZ+YC5456M9jtMbbekt96Q1nJNavMVxqZLUhovMDSck1x/RlLdKYm1J4hmllBzjGhm8dVHiGYWV3WIaGaxlQeIZhZTsY9oZtHle4hmFlW2i2hmkaU7iGYWUbKNaGbhxVuIZhbm2kQ0s1DnBqKZhRSuI5pZcP4aopkFOVYRzSwwZwXRzALsy4hm5m9bQjQzP+siopn5WhYQzczHPI9oZt6mOUQz80qfRTQzz7QZRDPzME4jmpm7YQrRzNySJ/kHBMQeY4jbomQAAAAASUVORK5CYII=" },
  { id: "violet", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABJUlEQVR42r3N+SoDAAAG8O+dRCISiUgkIhmmMWNuGcaYueYKEUKEeBP3fd/3zdz3Px9P8f1e4IfJll9OuH843vTNsYYvjtZ9csT1wWHnO4dq3jjoeOVA5Qv77c/sK39ir+2RPaUedpd42FX8wM7Ce3bk37E975Zt1hu2Zl+z2XJFt/mSjZkXbDCdsz79jC7jKWtTTwhl5jQcE8qsOvmIUGaOpENCmVUlHhDKzJ6wTyizivg9QpmVxe0SyswWu0Mos9KYbUKZlURvEcqsOGqTUGZFkRuEMiuIWCeUWX74f6jMcsPWCGVmDV0llFlOyAqhzCzBy4QyywpaIpSZOXCRUGYZAQuEMjP5zxPKLN1vjlBmRt9ZQpml+cwQyizFe5pQZgavKf4Bcj5seWy5PHMAAAAASUVORK5CYII=" },
  { id: "amber", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABL0lEQVR42r3N9yogAAAG8O85kJmVlZnVWVlZmeERRCRyiUSu6y4SiUhEIhKRSGQ7e+89zt7z789bfL8X+OFrIpWfYyn8GE3m+0gS34YT+TqUwJfBeD4PxPGpP5aPfTF86I3mfU8U77ojedsVwZvOcF53hPGqPZSXbSH83xrMi5YgnjcH8qwpgKeN/jxp8ONx/Q8e1fnysNaHBzXehDI7qPYilNl+lSehzPYqPQhltlvhTiiznXI3Qpltl7kSymzrrwuhzDb/OBPKbOO3E6HM1n85EspsrdSBUGarJfaEMlsptiOU2XKRLaHMlgptCGW2WGBNKLOFfCtCmc3/tCSU2VyeBaHMZnPNCWX2L8eMUGYz2aaEMpvOMiGU2VSmMaHMJjOMCGU2kW5IKLPxNAN+A0+7Jf9izFkoAAAAAElFTkSuQmCC" },
  { id: "coral", uri: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAYAAAByDd+UAAABGklEQVR42r3N2TKCARgG4O+6GIZhGEZKKaWUVn/Kn1JKhskwDHeHbFmyZcuWfX99V/EePMePYK2Iv9UZ/K4U8LOslvL4XpzG10IOn6UsPuan8D6XwdusKqbxWpjESz6F55yJp6yJRmYCjXQSj6kEHsxx3CfjuEsYuI0bqBtjqMdiuIlGcR2O4CoUgTCzy2AYwswuAiEIM6v5gxoSs5pvFMLMzr0BCDM78/ghzOzUrSEzO3GNQJjZsdMHYWZVh1dDYla1D0OY2ZFNQ2Z2aPVAmNmBxQ1hZvt9QxBmVul1aUjMKj1OCDPb6x6EMLPdLg2Z2U6nA8LMtjvsEGa21T4AYWblNpuGxKzcqiEz22yxQpjZRnM/hJmtN1nwD0suMMOVFJrSAAAAAElFTkSuQmCC" },
];

/** Is this avatarUrl one of our built-in gradient presets? */
export function isAvatarPreset(url: string | null | undefined): boolean {
  return !!url && AVATAR_PRESETS.some((p) => p.uri === url);
}

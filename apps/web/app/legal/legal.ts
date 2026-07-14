// Shared constants for the public legal pages (/privacy, /terms). Keep the
// contact + effective date in one place so the two documents never disagree.
//
// NOTE FOR THE OPERATOR: confirm the legal-entity name, postal address, and
// contact address below match your registered business before App Store
// submission (App Review checks the privacy policy resolves and is accurate).
export const LEGAL = {
  appName: "HYBRID",
  operator: "HYBRID",
  contactEmail: "privacy@hybrid.app",
  effectiveDate: "July 14, 2026",
} as const;

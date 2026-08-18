import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "../legal/legal";

export const metadata: Metadata = {
  title: `Terms of Service – ${LEGAL.appName}`,
  description: `The terms that govern your use of ${LEGAL.appName}.`,
};

const wrap: React.CSSProperties = {
  maxWidth: 760,
  margin: "0 auto",
  padding: "48px 22px 96px",
  color: "#f7f6f3",
  background: "#0c0d0c",
  minHeight: "100vh",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  lineHeight: 1.65,
  fontSize: 16,
};
const h1: React.CSSProperties = { fontSize: 30, fontWeight: 800, margin: "0 0 6px" };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, margin: "34px 0 10px" };
const muted: React.CSSProperties = { color: "#8b8f86", fontSize: 14 };
const li: React.CSSProperties = { margin: "6px 0" };

export default function TermsPage() {
  return (
    <main style={wrap}>
      <p style={muted}>
        <Link href="/" style={{ color: "#c3d363" }}>
          ← {LEGAL.appName}
        </Link>
      </p>
      <h1 style={h1}>Terms of Service</h1>
      <p style={muted}>Effective {LEGAL.effectiveDate}</p>

      <p style={{ marginTop: 20 }}>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the {LEGAL.appName} apps and website
        (the &ldquo;Service&rdquo;) provided by {LEGAL.operator}. By creating an account or using the
        Service, you agree to these Terms.
      </p>

      <h2 style={h2}>Eligibility</h2>
      <p>
        You must be at least 13 years old (or the minimum age of digital consent in your country) to use
        the Service. If you use the Service on behalf of an organization, you represent that you are
        authorized to accept these Terms for it.
      </p>

      <h2 style={h2}>Your account</h2>
      <ul>
        <li style={li}>You are responsible for the activity on your account and for keeping your login secure.</li>
        <li style={li}>You agree to provide accurate information and to keep it up to date.</li>
        <li style={li}>You may delete your account at any time from Settings → Danger zone.</li>
      </ul>

      <h2 style={h2}>Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li style={li}>Break the law, infringe others&rsquo; rights, or misuse other users&rsquo; data.</li>
        <li style={li}>Attempt to access accounts, data, or systems you are not authorized to access.</li>
        <li style={li}>Interfere with, overload, or reverse-engineer the Service except as permitted by law.</li>
        <li style={li}>Upload content that is unlawful, harmful, or that you do not have the right to share.</li>
      </ul>

      <h2 style={h2}>Health &amp; fitness disclaimer</h2>
      <p>
        {LEGAL.appName} provides training and fitness information for general informational purposes only.
        It is <b>not medical advice</b> and is not a substitute for professional medical guidance. Consult a
        qualified professional before starting or changing any exercise or nutrition program. You use the
        Service and perform any activity at your own risk.
      </p>

      <h2 style={h2}>Subscriptions &amp; payments</h2>
      <ul>
        <li style={li}>
          Some features require a paid subscription (&ldquo;Full&rdquo;). Pricing and any free-trial terms
          are shown before you purchase.
        </li>
        <li style={li}>
          Purchases made in the iOS app are processed by Apple and are subject to Apple&rsquo;s terms.
          Subscriptions renew automatically until canceled; manage or cancel in your Apple account settings.
          Purchases made on the web are processed by our payment provider.
        </li>
        <li style={li}>
          Except where required by law or the applicable store&rsquo;s policy, payments are non-refundable.
        </li>
      </ul>

      <h2 style={h2}>Your content</h2>
      <p>
        You retain ownership of the data and content you add. You grant us the limited rights needed to host
        and process it to operate the Service for you. We handle your data as described in our{" "}
        <Link href="/privacy" style={{ color: "#c3d363" }}>Privacy Policy</Link>.
      </p>

      <h2 style={h2}>Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate access if you violate these
        Terms or to protect the Service and its users.
      </p>

      <h2 style={h2}>Disclaimers &amp; limitation of liability</h2>
      <p>
        The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
        permitted by law, {LEGAL.operator} is not liable for indirect, incidental, or consequential damages,
        or for loss of data or profits, arising from your use of the Service. Nothing in these Terms limits
        rights that cannot be limited under applicable law.
      </p>

      <h2 style={h2}>Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be reflected by updating the
        effective date above and, where appropriate, notifying you in the app. Continued use after changes
        means you accept the updated Terms.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions: <a href={`mailto:${LEGAL.contactEmail}`} style={{ color: "#c3d363" }}>{LEGAL.contactEmail}</a>.
      </p>

      <p style={{ ...muted, marginTop: 40 }}>
        <Link href="/privacy" style={{ color: "#8b8f86" }}>Privacy Policy</Link>
      </p>
    </main>
  );
}

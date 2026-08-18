import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL } from "../legal/legal";

export const metadata: Metadata = {
  title: `Privacy Policy – ${LEGAL.appName}`,
  description: `How ${LEGAL.appName} collects, uses, and protects your data.`,
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
const muted: React.CSSProperties = { color: "#8a9691", fontSize: 14 };
const li: React.CSSProperties = { margin: "6px 0" };

export default function PrivacyPage() {
  return (
    <main style={wrap}>
      <p style={muted}>
        <Link href="/" style={{ color: "#c3d363" }}>
          ← {LEGAL.appName}
        </Link>
      </p>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={muted}>Effective {LEGAL.effectiveDate}</p>

      <p style={{ marginTop: 20 }}>
        This Privacy Policy explains how {LEGAL.operator} (&ldquo;{LEGAL.appName},&rdquo; &ldquo;we,&rdquo;
        &ldquo;us&rdquo;) collects, uses, and shares information when you use the {LEGAL.appName} apps and
        website (the &ldquo;Service&rdquo;). We designed the Service to keep your training data yours.
      </p>

      <h2 style={h2}>Information we collect</h2>
      <ul>
        <li style={li}>
          <b>Account information</b> — your email address and name, provided when you create an account or
          sign in with Apple or Google.
        </li>
        <li style={li}>
          <b>Training &amp; health data you enter</b> — workouts, sets and loads, check-ins, readiness and
          recovery signals, body measurements, journal entries, and progress photos.
        </li>
        <li style={li}>
          <b>Connected services (optional)</b> — if you link a wearable or third-party service, we store
          the access tokens needed to sync the data you authorize. These tokens are encrypted at rest.
        </li>
        <li style={li}>
          <b>Technical data</b> — basic, non-tracking information such as app version and error diagnostics
          needed to operate and debug the Service.
        </li>
      </ul>

      <h2 style={h2}>How we use it</h2>
      <ul>
        <li style={li}>To provide the Service — store your training history, generate plans, and power the coaching features.</li>
        <li style={li}>To operate, secure, and improve the Service, and to prevent abuse.</li>
        <li style={li}>To communicate with you about your account and, where you have opted in, product updates.</li>
      </ul>
      <p>
        We do <b>not</b> sell your personal data, and we do <b>not</b> use it for cross-app or cross-site
        advertising tracking. The app does not include third-party advertising or tracking SDKs.
      </p>

      <h2 style={h2}>How data is shared</h2>
      <ul>
        <li style={li}>
          <b>With a coach you connect to</b> — if you accept a coaching link, the coach can see the data
          the product exposes for coaching (e.g. workouts and check-ins you choose to share). You can end
          the link at any time.
        </li>
        <li style={li}>
          <b>Service providers</b> — infrastructure providers that host the Service on our behalf (for
          example our database/authentication host and email provider), bound to process data only for us.
        </li>
        <li style={li}>
          <b>Legal</b> — where required by law or to protect the rights, safety, and security of users and
          the Service.
        </li>
      </ul>

      <h2 style={h2}>Your rights &amp; choices</h2>
      <ul>
        <li style={li}>
          <b>Access &amp; export</b> — download a copy of your data from Settings → Data (&ldquo;Download my data&rdquo;).
        </li>
        <li style={li}>
          <b>Reset</b> — erase all of your training data while keeping your login (Settings → Danger zone).
        </li>
        <li style={li}>
          <b>Delete your account</b> — permanently delete your account and all associated data in-app from
          Settings → Danger zone (&ldquo;Delete my account&rdquo;). This is irreversible.
        </li>
        <li style={li}>
          Depending on where you live (e.g. the EU/EEA under GDPR, or California under the CCPA), you may
          have additional rights to access, correct, port, or delete your data, and to object to certain
          processing. Contact us to exercise them.
        </li>
      </ul>

      <h2 style={h2}>Data retention</h2>
      <p>
        We keep your data for as long as your account is active. When you delete your account, we delete
        your personal data from our systems, except limited records we must keep for legal or security
        reasons (for example, a record that an email address unsubscribed, so we can honor that choice).
      </p>

      <h2 style={h2}>Security</h2>
      <p>
        We protect data in transit with TLS and apply row-level access controls so users can only reach
        their own data. Sensitive third-party tokens are encrypted at rest. No system is perfectly secure,
        but we work to protect your information and to limit access to it.
      </p>

      <h2 style={h2}>Children</h2>
      <p>
        The Service is not directed to children under 13 (or the minimum age required in your country), and
        we do not knowingly collect data from them.
      </p>

      <h2 style={h2}>Changes</h2>
      <p>
        We may update this policy from time to time. Material changes will be reflected by updating the
        effective date above and, where appropriate, notifying you in the app.
      </p>

      <h2 style={h2}>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${LEGAL.contactEmail}`} style={{ color: "#c3d363" }}>{LEGAL.contactEmail}</a>.
      </p>

      <p style={{ ...muted, marginTop: 40 }}>
        <Link href="/terms" style={{ color: "#8a9691" }}>Terms of Service</Link>
      </p>
    </main>
  );
}

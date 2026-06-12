"use client";

import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import { INK, INK2, LINE, LIME, CHALK, ASH, AMBER, BLUE, VIOLET, disp, mono, Mono, Card, Chip } from "@/lib/ui";

// Governance → "iOS simulator" guide. The mobile app is a managed Expo / React
// Native project (no checked-in ios/ folder), so running it in Apple's iOS
// Simulator goes through Expo. This screen is the operator-facing runbook for
// doing exactly that on a Mac with Xcode. Static reference content — no fetch.

export default function AdminSimulator() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* intro / what this is — plain language */}
      <Card style={{ borderLeft: `3px solid ${AMBER}` }}>
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 8 }} c={AMBER}>
          Open the HYBRID app on a pretend iPhone
        </Mono>
        <p style={{ ...disp, fontSize: 14, lineHeight: 1.6, color: CHALK, margin: 0 }}>
          You don&rsquo;t need a real iPhone to try the app. Your <strong>Mac</strong> (an Apple computer)
          can show a <strong>pretend iPhone right on the screen</strong> — like a toy phone you can tap with
          your mouse. This page tells you exactly what to type, one line at a time. You can&rsquo;t break
          anything, so don&rsquo;t worry. Just go from the top and do each box in order. 🙂
        </p>
      </Card>

      {/* glossary — what the scary words mean */}
      <Card>
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          First, a few words explained
        </Mono>
        <ul style={list}>
          <Li><strong>Mac</strong> — an Apple computer (a MacBook or iMac). The pretend iPhone only works on a Mac.</Li>
          <Li><strong>Terminal</strong> — a plain black window where you <em>type</em> instructions instead of clicking buttons. On a Mac, press <kbd style={kbd}>Cmd</kbd>+<kbd style={kbd}>Space</kbd>, type &ldquo;Terminal&rdquo;, and press Enter to open it.</Li>
          <Li><strong>Type a command</strong> — copy the words from a black box below, paste them into the Terminal, and press <kbd style={kbd}>Enter</kbd>. That&rsquo;s it. Each box has a <em>Copy</em> button.</Li>
          <Li><strong>Xcode</strong> — a free Apple program. It&rsquo;s the thing that knows how to show the pretend iPhone.</Li>
          <Li><strong>Simulator</strong> — the pretend iPhone itself, a little phone-shaped window you can tap.</Li>
          <Li><strong>The app code</strong> — the HYBRID app&rsquo;s building blocks, kept in a folder we&rsquo;ll copy to your computer.</Li>
        </ul>
      </Card>

      {/* THE walkthrough — one continuous numbered list, super simple */}
      <Card style={{ borderLeft: `3px solid ${LIME}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>
            Do these in order — top to bottom
          </Mono>
          <Chip c={LIME}>start here</Chip>
          <Chip c={ASH}>about 15 min</Chip>
        </div>
        <p style={para}>
          Steps 1&ndash;5 you only ever do <strong>once</strong> (they set things up). Steps 6&ndash;7 are the
          ones you&rsquo;ll do every time you want to open the app. Ready? Go. 👇
        </p>
        <Steps>
          <Step n={1} title="Get Xcode (do this once)">
            On your Mac, open the <strong>App Store</strong> (the blue &ldquo;A&rdquo; icon). Search for{" "}
            <strong>Xcode</strong> and press <strong>Get / Install</strong>. It&rsquo;s big, so this can take a
            while — go have a snack. 🍎 You don&rsquo;t need a Windows or Linux computer; this only works on a Mac.
          </Step>
          <Step n={2} title="Open Xcode one time and let it set up">
            Open <strong>Xcode</strong> once. If it asks you to agree to anything, click <strong>Agree</strong> and
            type your computer password if needed. Then, in the top menu, click{" "}
            <strong>Xcode → Settings → Components</strong> and download an <strong>iPhone</strong> option in the
            list (this is the pretend phone). Now you can close Xcode.
          </Step>
          <Step n={3} title="Install two helpers (copy, paste, Enter)">
            Open the <strong>Terminal</strong> (see the words above if you forgot how). If you&rsquo;ve never used
            it, first install &ldquo;Homebrew&rdquo; from <code style={code}>brew.sh</code> by pasting the one line
            on that website. Then paste these two lines, one at a time:
            <Cmd>{`brew install node
npm install -g pnpm`}</Cmd>
            <strong>node</strong> and <strong>pnpm</strong> are just little tools the app needs. Wait for each one
            to finish before the next.
          </Step>
          <Step n={4} title="Copy the app onto your computer">
            Still in the Terminal, paste these three lines (one at a time). They download the app and get it ready:
            <Cmd>{`git clone https://github.com/rafalablewski/hybrid.git
cd hybrid
pnpm install`}</Cmd>
            <em>What they do:</em> line 1 downloads the app, line 2 steps <em>into</em> the app&rsquo;s folder, line
            3 grabs all the extra pieces it needs. The last one can take a couple of minutes — that&rsquo;s normal.
          </Step>
          <Step n={5} title="(Nice to have) One more small helper">
            This one just makes things smoother. Paste it:
            <Cmd>{`brew install watchman`}</Cmd>
            If it gives a little warning, that&rsquo;s okay — you can keep going.
          </Step>
          <Step n={6} title="Start the app's engine">
            Paste this and press <kbd style={kbd}>Enter</kbd>:
            <Cmd>{`pnpm --filter @hybrid/mobile dev`}</Cmd>
            A bunch of text will appear and it will look like it&rsquo;s &ldquo;waiting&rdquo; — that&rsquo;s good!
            <strong> Leave this window open.</strong> Think of it as the app&rsquo;s engine running.
          </Step>
          <Step n={7} title="Open the pretend iPhone">
            In that same window, press the letter <kbd style={kbd}>i</kbd> on your keyboard — <strong>i is for
            iPhone</strong>. Wait a little… a <strong>phone-shaped window pops up</strong> (that&rsquo;s the
            Simulator, run by Xcode) and the HYBRID app opens inside it! 🎉 If it asks to install &ldquo;Expo
            Go,&rdquo; say <strong>yes</strong>.
            <div style={{ marginTop: 6 }}>
              <strong>Important:</strong> press <kbd style={kbd}>i</kbd>, NOT <kbd style={kbd}>w</kbd>. The{" "}
              <kbd style={kbd}>w</kbd> key opens the app in <strong>Safari</strong> (a web preview) — handy, but
              that is the website, not the real iPhone app. If Safari opened, you pressed <kbd style={kbd}>w</kbd>{" "}
              (or clicked a link); just go back to the engine window and press <kbd style={kbd}>i</kbd> instead.
            </div>
          </Step>
          <Step n={8} title="That's it — play with it!">
            Tap around the pretend phone with your mouse, just like a real one. If you ever change something in the
            code, it updates by itself. Want to start over? Press <kbd style={kbd}>r</kbd> to refresh, or{" "}
            <kbd style={kbd}>i</kbd> to open the phone again.
          </Step>
        </Steps>
        <Note c={VIOLET}>
          <strong>Can&rsquo;t find or open the Simulator? Open it by hand.</strong> The &ldquo;Xcode Simulator&rdquo;
          is really a separate app just called <strong>Simulator</strong> (it comes <em>with</em> Xcode — you
          don&rsquo;t open Xcode itself). To launch it yourself:
          <div style={{ marginTop: 6 }}>
            <strong>1.</strong> Press <kbd style={kbd}>⌘ Cmd</kbd>+<kbd style={kbd}>Space</kbd> (this opens Spotlight
            search). <strong>2.</strong> Type <strong>Simulator</strong>. <strong>3.</strong> Press{" "}
            <kbd style={kbd}>Enter</kbd>. A phone-shaped window appears — <strong>that IS the Xcode Simulator.</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Leave it open, go back to the engine window (step 6) and press <kbd style={kbd}>i</kbd> — Expo loads the
            app into the phone you just opened. If nothing called &ldquo;Simulator&rdquo; shows up in Spotlight, Xcode
            isn&rsquo;t fully installed yet — do steps 1&ndash;2 first.
          </div>
          <div style={{ marginTop: 6 }}>
            If pressing <kbd style={kbd}>i</kbd> shows an error about Xcode, paste this one line (it tells your Mac
            where Xcode is), type your Mac password when asked — you won&rsquo;t see it as you type, that&rsquo;s
            normal — then press <kbd style={kbd}>i</kbd> again:
          </div>
          <Cmd>{`sudo xcode-select -s /Applications/Xcode.app`}</Cmd>
        </Note>
        <Note c={LIME}>
          <strong>✓ You did it!</strong> Next time you only need steps 6 and 7. The app opens even with no key —
          you just can&rsquo;t <em>sign in</em> yet, you can still look around.
        </Note>
        <Note c={ASH}>
          <strong>Already set up? The whole thing in a few lines.</strong> Get the newest code, then start the engine
          and press <kbd style={kbd}>i</kbd> (with your Simulator open):
          <Cmd>{`cd hybrid
git checkout claude/loving-ritchie-x181a0
git pull
pnpm install
pnpm --filter @hybrid/mobile dev`}</Cmd>
          When it&rsquo;s waiting, press <kbd style={kbd}>i</kbd>. That bundles the GitHub repo and loads it into the
          open Simulator. (<code style={code}>git pull</code> + <code style={code}>pnpm install</code> are only needed
          when the code changed — otherwise just the last line, then <kbd style={kbd}>i</kbd>.)
        </Note>
        <Note c={BLUE}>
          <strong>Want to actually log in?</strong> You need one key called{" "}
          <code style={code}>EXPO_PUBLIC_SUPABASE_ANON_KEY</code>. An admin has it (in Supabase it&rsquo;s under
          Project Settings → API → <code style={code}>anon public</code>). Make a new file named{" "}
          <code style={code}>.env</code> inside the <code style={code}>apps/mobile</code> folder, paste this line in,
          and replace the last part with your real key:
          <Cmd>{`EXPO_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-public-key-here`}</Cmd>
          <strong>Prefer the Terminal?</strong> You can make the file in one go — go into the folder and write the
          line into <code style={code}>.env</code> (swap in your real key first):
          <Cmd>{`cd apps/mobile
echo 'EXPO_PUBLIC_SUPABASE_ANON_KEY=paste-your-anon-public-key-here' > .env`}</Cmd>
          A single <code style={code}>&gt;</code> makes the file (and overwrites it if it already exists); use{" "}
          <code style={code}>&gt;&gt;</code> instead to add to a file you already have. Keep the single quotes so the
          key stays in one piece. Then stop the engine (click the engine window and press{" "}
          <kbd style={kbd}>Ctrl</kbd>+<kbd style={kbd}>C</kbd>) and start it again with step 6. Now sign-in works!
          Your <code style={code}>.env</code> file stays on your own computer — it is never uploaded (it&rsquo;s in{" "}
          <code style={code}>.gitignore</code>), which is exactly why we never paste the real key onto this page.
        </Note>
        <Note c={AMBER}>
          One thing the pretend phone <strong>can&rsquo;t</strong> do this easy way: take photos with the camera or
          save a workout picture. If you specifically need those, do the extra section just below. Otherwise you&rsquo;re
          all set.
        </Note>
      </Card>

      {/* Add-on A — native build (camera/share), still simple */}
      <Card style={{ borderLeft: `3px solid ${BLUE}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={BLUE}>
            Extra — only if you need the camera or save-photo
          </Mono>
          <Chip c={BLUE}>optional</Chip>
        </div>
        <p style={para}>
          Do steps 1&ndash;5 above first. Then, instead of step 6&ndash;7, build a fuller version of the app. It
          takes a few extra minutes the first time. Open the Terminal and paste these:
        </p>
        <Steps>
          <Step n={9} title="Install one more helper (once)">
            <Cmd>{`brew install cocoapods`}</Cmd>
          </Step>
          <Step n={10} title="Build it and open the pretend phone">
            <Cmd>{`cd apps/mobile
npx expo run:ios`}</Cmd>
            The <strong>first</strong> time this is slow (it&rsquo;s building the real app) — a few minutes is
            normal. After it finishes, the pretend iPhone opens with the camera and save-photo working.
          </Step>
        </Steps>
        <Note c={BLUE}>
          <strong>Or do it the &ldquo;real Xcode&rdquo; way (open the project and press ▶).</strong> If you&rsquo;d
          rather press the Play button in Xcode yourself, this builds the same thing. From the repo root:
          <Cmd>{`cd apps/mobile
npx expo prebuild --platform ios
open ios/HYBRID.xcworkspace`}</Cmd>
          That last line opens the project in Xcode. <strong>Important:</strong> open the{" "}
          <code style={code}>.xcworkspace</code> file, NOT <code style={code}>.xcodeproj</code>. Then in Xcode&rsquo;s
          top toolbar set the scheme to <strong>HYBRID</strong> and the destination to one of your simulators, and
          press the <strong>▶ Play</strong> button (or <kbd style={kbd}>⌘ Cmd</kbd>+<kbd style={kbd}>R</kbd>).
          <div style={{ marginTop: 6 }}>
            If the app loads <strong>blank or red</strong>, the JavaScript engine (Metro) isn&rsquo;t running — start
            it in a second Terminal and the app will connect:
          </div>
          <Cmd>{`cd apps/mobile
pnpm start`}</Cmd>
          Note: <code style={code}>npx expo prebuild</code> creates an <code style={code}>ios/</code> folder — that&rsquo;s
          generated build output, so don&rsquo;t commit it (it&rsquo;s already in <code style={code}>.gitignore</code>).
        </Note>
      </Card>

      {/* Add-on B — EAS cloud (no compiler), simple */}
      <Card style={{ borderLeft: `3px solid ${VIOLET}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em" }} c={VIOLET}>
            Extra — let a robot in the cloud build it for you
          </Mono>
          <Chip c={VIOLET}>optional</Chip>
        </div>
        <p style={para}>
          If step 10 above is too slow or grumpy on your computer, you can ask Expo&rsquo;s online helpers to build
          the app for you. (You still need a Mac to open the pretend phone at the end.) Paste these in the Terminal:
        </p>
        <Steps>
          <Step n={1} title="Sign in and ask for a build">
            <Cmd>{`cd apps/mobile
npx eas login
npx eas build --profile preview --platform ios`}</Cmd>
            It will make you a free Expo account login the first time. When it finishes, it gives you a download link.
          </Step>
          <Step n={2} title="Drop it onto the pretend phone">
            Download the file it gives you, unzip it to get a <code style={code}>HYBRID.app</code>, open the pretend
            iPhone, and simply <strong>drag the app onto it</strong>. (Or paste these two lines:)
            <Cmd>{`xcrun simctl install booted HYBRID.app
xcrun simctl launch booted app.hybrid.mobile`}</Cmd>
          </Step>
        </Steps>
        <Note c={AMBER}>
          For login to work in this version too, an admin needs to add the secret key{" "}
          <code style={code}>EXPO_PUBLIC_SUPABASE_ANON_KEY</code> (the steps are in the file{" "}
          <code style={code}>apps/mobile/SUBMIT.md</code>).
        </Note>
      </Card>

      {/* which one do I pick */}
      <Card>
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          Not sure which to do? Here&rsquo;s a cheat sheet
        </Mono>
        <Matrix
          rows={[
            ["I just want to look at the app + tap around", "Steps 1–8", LIME],
            ["I need the camera or save-a-photo to work", "Also do 9–10", BLUE],
            ["Building on my computer is too slow", "Use the cloud robot", VIOLET],
            ["I only want to check it doesn't crash", "pnpm --filter @hybrid/mobile export:ios", ASH],
          ]}
        />
      </Card>

      {/* if something goes wrong */}
      <Card>
        <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", display: "block", marginBottom: 12 }} c={ASH}>
          If something looks wrong (don&rsquo;t panic)
        </Mono>
        <ul style={list}>
          <Li>
            <strong>It says <code style={code}>supabaseKey is required.</code></strong> This was an old bug — the
            app crashed when it had no login key. It&rsquo;s <strong>fixed now</strong>. Get the fix by pulling the
            latest code: in the Terminal, go into the folder (<code style={code}>cd hybrid</code>) and paste{" "}
            <code style={code}>git pull</code>, then start again from step 6. The app will open even without a key
            (you just can&rsquo;t sign in until you add one — see the blue box up above).
          </Li>
          <Li>
            <strong>It opened in Safari, not a phone window.</strong> You pressed <kbd style={kbd}>w</kbd> (web) or
            clicked a link. That&rsquo;s only a website preview, not the iPhone app. Go back to the engine window
            and press <kbd style={kbd}>i</kbd> (for iPhone) — that&rsquo;s the one that opens the pretend phone via
            Xcode.
          </Li>
          <Li>
            <strong>I pressed <kbd style={kbd}>i</kbd> and no phone showed up.</strong> Go back to step 2 and make
            sure you downloaded an iPhone in <strong>Xcode → Settings → Components</strong>. Then try{" "}
            <kbd style={kbd}>i</kbd> again.
          </Li>
          <Li>
            <strong>It says a lot of red words.</strong> Red usually just means &ldquo;try again.&rdquo; Close the
            Terminal, open it fresh, go back into the folder with <code style={code}>cd hybrid</code>, and redo the
            last step.
          </Li>
          <Li>
            <strong>The app looks stuck or weird.</strong> In the engine window, paste{" "}
            <code style={code}>npx expo start -c</code> — that gives it a clean fresh start.
          </Li>
          <Li>
            <strong>I&rsquo;m totally stuck.</strong> That&rsquo;s okay! Copy the red words you see and show them to
            an admin or developer — they&rsquo;ll know what to do.
          </Li>
        </ul>
        <Note c={ASH}>
          Note for admins: this can only be done on a real Mac. It can&rsquo;t run inside this website&rsquo;s
          sandbox (there&rsquo;s no Mac here and the database is blocked).
        </Note>
      </Card>
    </div>
  );
}

/* ---------- small presentational helpers ---------- */

const code = {
  ...mono,
  fontSize: 12,
  color: LIME,
  background: INK,
  border: `1px solid ${LINE}`,
  borderRadius: 5,
  padding: "1px 5px",
} as const;

const kbd = {
  ...mono,
  fontSize: 11,
  color: CHALK,
  background: INK2,
  border: `1px solid ${LINE}`,
  borderRadius: 5,
  padding: "1px 6px",
} as const;

const para = { ...disp, fontSize: 14, lineHeight: 1.55, color: CHALK, margin: "0 0 12px" } as const;
const list = { margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10 } as const;

function Li({ children }: { children: ReactNode }) {
  return (
    <li style={{ display: "flex", gap: 10, ...disp, fontSize: 14, lineHeight: 1.5, color: CHALK }}>
      <span style={{ color: AMBER, flexShrink: 0 }}>›</span>
      <span>{children}</span>
    </li>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: 14 }}>{children}</div>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div
        style={{
          ...mono,
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: 7,
          background: INK2,
          border: `1px solid ${LINE}`,
          color: AMBER,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...disp, fontWeight: 700, fontSize: 14, color: CHALK, marginBottom: 6 }}>{title}</div>
        <div style={{ ...disp, fontSize: 13.5, lineHeight: 1.55, color: ASH }}>{children}</div>
      </div>
    </div>
  );
}

function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  // Reset the "copied" label after a moment, cleaning up the timer if the
  // component unmounts first (no state update on an unmounted component).
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    // `navigator.clipboard` is undefined on non-HTTPS / older browsers — guard
    // it so we never call `.then` on undefined.
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(children).then(
      () => setCopied(true),
      () => {},
    );
  };
  return (
    <div style={{ position: "relative", margin: "8px 0" }}>
      <pre
        style={{
          ...mono,
          fontSize: 12.5,
          lineHeight: 1.7,
          color: CHALK,
          background: INK,
          border: `1px solid ${LINE}`,
          borderRadius: 9,
          padding: "12px 14px",
          margin: 0,
          overflowX: "auto",
          whiteSpace: "pre",
        }}
      >
        {children}
      </pre>
      <button
        onClick={copy}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          ...mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: ".08em",
          color: copied ? INK : ASH,
          background: copied ? LIME : INK2,
          border: `1px solid ${LINE}`,
          borderRadius: 6,
          padding: "3px 8px",
          cursor: "pointer",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function Note({ children, c }: { children: ReactNode; c: string }) {
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 10,
        background: `${c}12`,
        border: `1px solid ${c}33`,
        borderRadius: 9,
        padding: "10px 12px",
        ...disp,
        fontSize: 13,
        lineHeight: 1.5,
        color: CHALK,
      }}
    >
      <span style={{ color: c, flexShrink: 0 }}>!</span>
      <span>{children}</span>
    </div>
  );
}

function Matrix({ rows }: { rows: [string, string, string][] }) {
  return (
    <div style={{ display: "grid", gap: 0 }}>
      {rows.map(([goal, path, c], i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "9px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${LINE}` : "none",
          }}
        >
          <span style={{ ...disp, fontSize: 13.5, color: CHALK }}>{goal}</span>
          <Mono s={{ fontSize: 12, textAlign: "right", flexShrink: 0 }} c={c}>
            {path}
          </Mono>
        </div>
      ))}
    </div>
  );
}

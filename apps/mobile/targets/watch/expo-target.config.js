/** @type {import('@bacons/apple-targets').Config} */
// The HYBRID Apple Watch companion, v1: today at a glance on the wrist —
// session, streak, done state — fed over WatchConnectivity from the phone
// (an App Group does NOT span two devices). Deliberately a GLANCE app first:
// logging from the wrist (and silent logging, which turns the Watch into the
// primary surface) builds on this scaffold. Generated as a real Xcode target
// by @bacons/apple-targets during prebuild — ONLY when WITH_APPLE_TARGETS=1.
module.exports = {
  type: "watch",
  name: "HYBRID Watch",
  bundleIdentifier: "com.hybriddomain.xyz.watchkitapp",
  deploymentTarget: "10.0",
  colors: {
    $accent: "#c6f84f",
  },
};

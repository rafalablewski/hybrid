const { withEntitlementsPlist } = require("@expo/config-plugins");

/**
 * Strip the `aps-environment` entitlement that expo-notifications injects.
 *
 * We only use LOCAL notifications (the workout rest timer) — those don't need
 * aps-environment; it's only for REMOTE push (APNs). Our Apple account also
 * authenticates via an App Store Connect API key, which can't provision the
 * Push Notifications capability into the ad-hoc provisioning profile, so
 * requesting aps-environment makes the iOS build fail. Removing it here keeps
 * local notifications working while letting the build pass. Re-evaluate when
 * real push is set up (see the push-notifications capability).
 */
module.exports = function withNoApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults["aps-environment"];
    return cfg;
  });
};

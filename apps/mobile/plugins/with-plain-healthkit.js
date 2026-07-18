const { withEntitlementsPlist } = require("@expo/config-plugins");

/**
 * Strip the empty `com.apple.developer.healthkit.access` array that the
 * react-native-health plugin always writes into the entitlements.
 *
 * We only use PLAIN HealthKit (read HRV / resting HR / sleep). The `.access`
 * key exists solely to request the *health-records* (Verifiable Health
 * Records / clinical documents) capability, which needs special assignment
 * from Apple — and Xcode treats the key's mere PRESENCE, even as an empty
 * array, as requesting it, failing the archive with "Provisioning profile
 * doesn't include the HealthKit Access (Verifiable Health Records)
 * capability" (TestFlight run 29661636610). Dropping the empty key leaves
 * `com.apple.developer.healthkit: true`, which only needs the ordinary
 * HealthKit capability on the App ID. A NON-empty access list (someone opts
 * into clinical records later) is deliberately left alone.
 *
 * ORDERING: entitlement mods run in REVERSE of the app.json plugins array, so
 * this plugin must stay listed BEFORE react-native-health to run after it —
 * listed after, it runs first and the key comes back.
 */
module.exports = function withPlainHealthKit(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const access = cfg.modResults["com.apple.developer.healthkit.access"];
    if (Array.isArray(access) && access.length === 0) {
      delete cfg.modResults["com.apple.developer.healthkit.access"];
    }
    return cfg;
  });
};

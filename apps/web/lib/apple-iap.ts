import fs from "node:fs";
import path from "node:path";
import {
  AppStoreServerAPIClient,
  SignedDataVerifier,
  Environment,
} from "@apple/app-store-server-library";

/**
 * Apple In-App Purchase verification — App Store Server API (StoreKit 2).
 *
 * This replaces the deprecated `verifyReceipt` + shared-secret path. The native
 * client sends a StoreKit 2 `transactionId`; here we authenticate to Apple with
 * an App Store Connect API key (.p8, signed into a short-lived JWT by Apple's
 * library), fetch the signed transaction, and cryptographically VERIFY its JWS
 * signature chain back to an Apple root CA before trusting a single field.
 *
 * Everything is env-driven and lazy: with no config (or no root certs) the
 * helper reports `appleIapConfigured() === false` and the route 503s, so the
 * deploy is safe until the credentials + certs land. Required env:
 *   APPLE_IAP_PRIVATE_KEY   the .p8 contents (\n-escaped). SERVER-ONLY secret.
 *   APPLE_IAP_KEY_ID        the key id (the AuthKey_<KEYID>.p8 filename)
 *   APPLE_IAP_ISSUER_ID     App Store Connect API issuer id (UUID)
 *   APPLE_IAP_BUNDLE_ID     the app bundle id
 *   APPLE_ROOT_CERTS_DIR    dir of Apple root CA .cer files (public, downloadable)
 * Optional:
 *   APPLE_IAP_PRODUCT_FULL  product id that grants Full (purchase pinned to it)
 *   APPLE_IAP_ENV           "Sandbox" (default) | "Production"
 *   APPLE_IAP_APP_APPLE_ID  numeric app id — REQUIRED when ENV=Production
 *   APPLE_IAP_ONLINE_CHECKS "false" to disable OCSP revocation checks (default on)
 */

type AppleIapConfig = {
  privateKey: string;
  keyId: string;
  issuerId: string;
  bundleId: string;
  productId?: string;
  environment: Environment;
  appAppleId?: number;
  rootCerts: Buffer[];
  onlineChecks: boolean;
};

// `undefined` = not yet resolved; `null` = resolved-but-unconfigured.
let _cfg: AppleIapConfig | null | undefined;
let _client: AppStoreServerAPIClient | null = null;
let _verifier: SignedDataVerifier | null = null;

/** Read every Apple root CA cert file from APPLE_ROOT_CERTS_DIR (best-effort). */
function loadRootCerts(): Buffer[] {
  const dir = process.env.APPLE_ROOT_CERTS_DIR;
  if (!dir) return [];
  const abs = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  try {
    return fs
      .readdirSync(abs)
      .filter((f) => /\.(cer|crt|pem|der)$/i.test(f))
      .map((f) => fs.readFileSync(path.join(abs, f)));
  } catch {
    return [];
  }
}

function resolveConfig(): AppleIapConfig | null {
  if (_cfg !== undefined) return _cfg;

  const privateKey = (process.env.APPLE_IAP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const keyId = process.env.APPLE_IAP_KEY_ID ?? "";
  const issuerId = process.env.APPLE_IAP_ISSUER_ID ?? "";
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID ?? "";
  const rootCerts = loadRootCerts();
  const environment =
    (process.env.APPLE_IAP_ENV ?? "Sandbox").toLowerCase() === "production"
      ? Environment.PRODUCTION
      : Environment.SANDBOX;
  const appAppleId = process.env.APPLE_IAP_APP_APPLE_ID
    ? Number(process.env.APPLE_IAP_APP_APPLE_ID)
    : undefined;

  // Minimum to operate. The signature verifier additionally requires the Apple
  // root certs, and Production additionally requires the numeric app id.
  const ready =
    privateKey &&
    keyId &&
    issuerId &&
    bundleId &&
    rootCerts.length > 0 &&
    (environment !== Environment.PRODUCTION || !!appAppleId);

  _cfg = ready
    ? {
        privateKey,
        keyId,
        issuerId,
        bundleId,
        productId: process.env.APPLE_IAP_PRODUCT_FULL || undefined,
        environment,
        appAppleId,
        rootCerts,
        onlineChecks: process.env.APPLE_IAP_ONLINE_CHECKS !== "false",
      }
    : null;
  return _cfg;
}

/** Whether the Apple IAP path is fully configured (key + ids + root certs). */
export function appleIapConfigured(): boolean {
  return resolveConfig() !== null;
}

/** The product id that grants Full, if pinned. */
export function appleProductFull(): string | undefined {
  return process.env.APPLE_IAP_PRODUCT_FULL || undefined;
}

export type VerifiedPurchase = { productId?: string; expiresDateMs?: number };

/**
 * Fetch + signature-verify a StoreKit 2 transaction from Apple. Returns the
 * decoded, trusted transaction, or `null` when IAP isn't configured. Throws on
 * a network/verification failure (the caller maps that to a 502).
 */
export async function verifyAppleTransaction(
  transactionId: string,
): Promise<VerifiedPurchase | null> {
  const cfg = resolveConfig();
  if (!cfg) return null;

  if (!_client) {
    _client = new AppStoreServerAPIClient(
      cfg.privateKey,
      cfg.keyId,
      cfg.issuerId,
      cfg.bundleId,
      cfg.environment,
    );
  }
  if (!_verifier) {
    _verifier = new SignedDataVerifier(
      cfg.rootCerts,
      cfg.onlineChecks,
      cfg.environment,
      cfg.bundleId,
      cfg.appAppleId,
    );
  }

  const resp = await _client.getTransactionInfo(transactionId);
  const signed = resp.signedTransactionInfo;
  if (!signed) throw new Error("Apple returned no signedTransactionInfo");

  // Verifies the JWS signature chain to an Apple root before we trust a field.
  const payload = await _verifier.verifyAndDecodeTransaction(signed);
  return { productId: payload.productId, expiresDateMs: payload.expiresDate };
}

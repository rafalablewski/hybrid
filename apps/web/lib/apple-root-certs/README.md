# Apple root CA certificates

The Apple IAP verifier (`apps/web/lib/apple-iap.ts`) needs Apple's root CA
certificates to verify the JWS signature chain on a transaction. These are
**public** certificates — not secrets.

## What to put here

Download from <https://www.apple.com/certificateauthority/> and drop the `.cer`
files into this directory (the loader reads every `*.cer`/`*.crt`/`*.pem`/`*.der`
file here):

- **Apple Root CA - G3** (`AppleRootCA-G3.cer`) — the one that signs StoreKit JWS
- Apple Root CA - G2 (`AppleRootCA-G2.cer`) — include for completeness
- Apple Inc. Root Certificate (`AppleIncRootCertificate.cer`)

## Wiring

Point `APPLE_ROOT_CERTS_DIR` at this directory (relative to the web app root):

```
APPLE_ROOT_CERTS_DIR="lib/apple-root-certs"
```

Until at least one cert is present here AND the other `APPLE_IAP_*` vars are set,
`/api/billing/iap/verify` returns a 503 "not configured" — the deploy stays safe.

The `.cer` files are public and safe to commit if you prefer reproducible
deploys; alternatively, inject them at deploy time and keep this folder empty.

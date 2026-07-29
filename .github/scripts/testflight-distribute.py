#!/usr/bin/env python3
"""
Prove a build is INSTALLABLE, and say why when it is not.

WHY THIS EXISTS. `app-store-connect publish` uploads, App Store Connect
processes to VALID — and then nothing happens. A build that is VALID but not
yet released to a beta group is invisible in TestFlight, and indistinguishable
from one that never arrived: the workflow is green, Apple's API says the build
is fine, and the tester's build list simply does not grow. There is no email
for this state and no failure anywhere to look at.

The first cut of this script tried to report that state and could not, because
BOTH of its probes were wrong:

  * `GET /v1/builds/{id}/relationships/betaGroups` — Apple does not expose
    betaGroups as a READABLE relationship on a build (only POST/DELETE to
    attach and detach). It answers 403, which reads like a permissions problem
    and is not one. Group membership has to be read from the other side:
    `GET /v1/betaGroups/{id}/builds`.
  * `app-store-connect builds beta-details` returned nothing within its 60s of
    retries, so every run reported `internalBuildState = UNKNOWN` — the one
    value that decides whether a tester sees the build.

So a run could only ever say "uploaded, processed, probably fine". This does
the whole job over the REST API instead:

  1. INVENTORY. Prints the app's recent builds with the three attributes that
     decide visibility — processingState, internalBuildState, expired. When a
     build has gone missing from TestFlight, this listing is the diagnosis, and
     it is printed FIRST so a later failure still leaves it in the log.
  2. ATTACH. Adds the build to every internal group that does not already have
     it, checked against the group's real build list rather than assumed.
  3. VERIFY. Polls buildBetaDetail until internalBuildState is
     READY_FOR_BETA_TESTING and FAILS the run otherwise, naming the state.
     Green has to mean installable, or it means nothing.

Exit codes: 0 when the build is ready for testers; 1 when the app has no
internal group, or the build never became installable.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

import jwt  # PyJWT

API = "https://api.appstoreconnect.apple.com"

# How long to wait for Apple to move a VALID build to READY_FOR_BETA_TESTING.
# It is normally seconds after processing, but the two are separate pipelines
# and the gap is occasionally minutes.
READY_TIMEOUT_S = 10 * 60
POLL_S = 20

_token: str | None = None
_token_minted_at: float = 0.0


def token() -> str:
    """A short-lived ES256 JWT — the only auth App Store Connect accepts.

    Re-minted every 10 minutes: the polling below can outlive a single token,
    and an expired one surfaces as a 401 that looks like a bad key.
    """
    global _token, _token_minted_at
    now = time.time()
    if _token is None or now - _token_minted_at > 10 * 60:
        _token = jwt.encode(
            {
                "iss": os.environ["APPLE_ASC_ISSUER_ID"],
                "iat": int(now),
                "exp": int(now) + 15 * 60,
                "aud": "appstoreconnect-v1",
            },
            os.environ["APPLE_ASC_API_KEY_P8"],
            algorithm="ES256",
            headers={"kid": os.environ["APPLE_ASC_KEY_ID"], "typ": "JWT"},
        )
        _token_minted_at = now
    return _token


def call(method: str, path: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token()}")
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else {}


def try_call(method: str, path: str, body: dict | None = None) -> dict | None:
    """`call` for the places where a failure is information, not a crash."""
    try:
        return call(method, path, body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        print(f"  (HTTP {exc.code} on {path}: {detail})")
    except urllib.error.URLError as exc:
        print(f"  (could not reach App Store Connect for {path}: {exc.reason})")
    return None


def inventory(app_id: str, this_build: str) -> None:
    """The app's recent builds, as TestFlight sees them.

    processingState VALID says Apple accepted the binary; internalBuildState is
    the one that decides whether a tester can install it. A build sitting at
    PROCESSING_EXCEPTION or MISSING_EXPORT_COMPLIANCE is exactly the "green run,
    no new build in TestFlight" case, and this is the only place it is visible.
    """
    listing = try_call(
        "GET",
        f"/v1/builds?filter[app]={app_id}&limit=10"
        "&sort=-uploadedDate&include=buildBetaDetail",
    )
    if not listing:
        print("Could not list recent builds (see above).")
        return

    # The beta details arrive alongside the builds rather than nested in them.
    details = {
        item["id"]: item.get("attributes", {})
        for item in listing.get("included", [])
        if item.get("type") == "buildBetaDetails"
    }

    print("Recent builds for this app (newest first):")
    for build in listing.get("data", []):
        attrs = build.get("attributes", {})
        rel = build.get("relationships", {}).get("buildBetaDetail", {}).get("data") or {}
        beta = details.get(rel.get("id"), {})
        version = attrs.get("version", "?")
        marker = "→" if version == this_build else " "
        print(
            f"  {marker} {version:>12}  uploaded={attrs.get('uploadedDate', '?')}  "
            f"processing={attrs.get('processingState', '?')}  "
            f"internal={beta.get('internalBuildState', '?')}  "
            f"expired={attrs.get('expired', '?')}"
        )


def internal_groups(app_id: str) -> list[tuple[str, str, bool]]:
    """Every internal beta group, printed — the listing is half the diagnosis."""
    groups = call("GET", f"/v1/betaGroups?filter[app]={app_id}&limit=200")
    rows = groups.get("data", [])
    if not rows:
        print("::error::This app has NO beta groups at all, so a build has nowhere "
              "to be distributed. Create an internal group in App Store Connect → "
              "TestFlight → Internal Testing.")
        return []

    print(f"Beta groups on this app ({len(rows)}):")
    found = []
    for group in rows:
        attrs = group.get("attributes", {})
        is_internal = bool(attrs.get("isInternalGroup"))
        all_builds = bool(attrs.get("hasAccessToAllBuilds"))
        print(f"  - {attrs.get('name')!r:40} internal={is_internal} "
              f"hasAccessToAllBuilds={all_builds}")
        if is_internal:
            found.append((group["id"], attrs.get("name"), all_builds))
    return found


def attach(groups: list[tuple[str, str, bool]], build_id: str, build: str) -> None:
    """Put the build in front of each internal group that lacks it.

    Membership is read from `/v1/betaGroups/{id}/builds` — the readable side of
    the relationship. Groups with hasAccessToAllBuilds are checked too rather
    than trusted: "Apple attaches it automatically" is the assumption that made
    the previous version report success while nothing reached a phone.
    """
    for gid, name, all_builds in groups:
        listing = try_call("GET", f"/v1/betaGroups/{gid}/builds?limit=200")
        if listing is not None:
            if any(b["id"] == build_id for b in listing.get("data", [])):
                print(f"Build {build} is already in {name!r}.")
                continue
        if all_builds:
            # Apple attaches these itself; POSTing is rejected as a conflict.
            # If it is genuinely absent, the VERIFY step below is what catches
            # it — there is nothing useful to do from here.
            print(f"{name!r} takes every build automatically — leaving it to Apple.")
            continue
        added = try_call(
            "POST",
            f"/v1/betaGroups/{gid}/relationships/builds",
            {"data": [{"type": "builds", "id": build_id}]},
        )
        print(f"{'Added' if added is not None else 'Could NOT add'} "
              f"build {build} to {name!r}.")


def wait_until_ready(build_id: str, build: str) -> str:
    """Poll until testers can actually install it, or give up and say so."""
    deadline = time.time() + READY_TIMEOUT_S
    state = "UNKNOWN"
    while True:
        detail = try_call("GET", f"/v1/builds/{build_id}/buildBetaDetail")
        if detail:
            state = detail.get("data", {}).get("attributes", {}).get(
                "internalBuildState") or "UNKNOWN"
            if state == "READY_FOR_BETA_TESTING":
                print(f"Build {build} is ready for internal testers.")
                return state
        if time.time() >= deadline:
            return state
        print(f"  internal state {state} — waiting…")
        time.sleep(POLL_S)


def main() -> int:
    app_id = os.environ["APP_ID"]
    build_id = os.environ["BUILD_ID"]
    build = os.environ.get("BUILD", "?")

    # Printed before anything can fail, so a red run still carries the history
    # that explains it.
    inventory(app_id, build)
    print()

    groups = internal_groups(app_id)
    if not groups:
        print("::error::No INTERNAL beta group on this app. External groups need "
              "beta review, so nothing here can reach a tester immediately. Create "
              "an internal group in App Store Connect → TestFlight.")
        return 1
    print()

    attach(groups, build_id, build)
    print()

    state = wait_until_ready(build_id, build)
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
        env.write(f"INTERNAL_STATE={state}\n")

    if state == "READY_FOR_BETA_TESTING":
        return 0

    # Name the cause rather than leaving a bare exit 1. These are the states
    # that actually strand a build, and each has a different fix.
    hint = {
        "MISSING_EXPORT_COMPLIANCE":
            "Apple did not see ITSAppUsesNonExemptEncryption in Info.plist. "
            "Answer the encryption question on the build in App Store Connect "
            "to release this one; app.json ios.config.usesNonExemptEncryption "
            "should keep it from recurring.",
        "PROCESSING_EXCEPTION":
            "Apple failed the build after accepting it — the reason only ever "
            "arrives by email to the account holder.",
        "IN_BETA_REVIEW":
            "The build is queued for beta review, which internal testing should "
            "not require — check that the group really is an INTERNAL group.",
        "EXPIRED":
            "The build expired (TestFlight builds last 90 days).",
    }.get(state, "The build processed but was never released to internal testers. "
                 "Open App Store Connect → TestFlight and check this build for a "
                 "prompt (export compliance, or a pending Apple agreement — a "
                 "pending Program License Agreement silently blocks distribution "
                 "for every build on the account).")
    print(f"::error::Build {build} is not installable: internalBuildState={state}. {hint}")
    return 1


if __name__ == "__main__":
    sys.exit(main())

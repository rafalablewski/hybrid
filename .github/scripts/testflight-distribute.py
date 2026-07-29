#!/usr/bin/env python3
"""
Put a processed build in front of the internal testers.

WHY THIS EXISTS. `app-store-connect publish` uploads, and App Store Connect
processes — and then nothing happens. A build that is VALID but attached to no
beta group is invisible in TestFlight, and indistinguishable from one that never
arrived: the workflow is green, Apple's API says the build is fine, and the
tester's build list simply does not grow. That is exactly the state builds
81278222 and 81281267 landed in while every earlier build appeared normally.

So this does two things, in order:

  1. REPORTS. It prints every beta group on the app with the two attributes that
     decide whether a build shows up — `isInternalGroup` and
     `hasAccessToAllBuilds` — plus which groups already carry this build. When
     something is wrong, that listing is the diagnosis; there is nowhere else to
     read it from inside CI.
  2. ATTACHES. It adds the build to each internal group that does not already
     have it. Groups with `hasAccessToAllBuilds` are skipped: Apple attaches
     those automatically and POSTing again is a no-op at best.

The codemagic CLI can add a build to a group BY NAME but cannot list groups, and
a name we have to be told in advance is the thing that makes this fail silently
in the first place. So this talks to the REST API directly.

Exit codes: 0 on success (including "already attached"), 1 when the app has no
internal group at all — because then the build cannot reach anyone, which is a
release failure however green the rest of the run looks.
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


def token() -> str:
    """A short-lived ES256 JWT — the only auth App Store Connect accepts."""
    key_id = os.environ["APPLE_ASC_KEY_ID"]
    issuer = os.environ["APPLE_ASC_ISSUER_ID"]
    private_key = os.environ["APPLE_ASC_API_KEY_P8"]
    now = int(time.time())
    return jwt.encode(
        {"iss": issuer, "iat": now, "exp": now + 15 * 60, "aud": "appstoreconnect-v1"},
        private_key,
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


def call(method: str, path: str, bearer: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", f"Bearer {bearer}")
    if data:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
    return json.loads(raw) if raw else {}


def main() -> int:
    app_id = os.environ["APP_ID"]
    build_id = os.environ["BUILD_ID"]
    build_number = os.environ.get("BUILD", "?")
    bearer = token()

    groups = call("GET", f"/v1/betaGroups?filter[app]={app_id}&limit=200", bearer)
    rows = groups.get("data", [])
    if not rows:
        print("::error::This app has NO beta groups at all, so a build has nowhere "
              "to be distributed. Create an internal group in App Store Connect → "
              "TestFlight → Internal Testing.")
        return 1

    # The listing IS the diagnosis — print it before doing anything.
    print(f"Beta groups on this app ({len(rows)}):")
    internal = []
    for g in rows:
        a = g.get("attributes", {})
        is_internal = bool(a.get("isInternalGroup"))
        all_builds = bool(a.get("hasAccessToAllBuilds"))
        print(f"  - {a.get('name')!r:40} internal={is_internal} "
              f"hasAccessToAllBuilds={all_builds}")
        if is_internal:
            internal.append((g["id"], a.get("name"), all_builds))

    if not internal:
        print("::error::No INTERNAL beta group on this app. External groups need "
              "beta review, so nothing here can reach a tester immediately. Create "
              "an internal group in App Store Connect → TestFlight.")
        return 1

    # Which groups already carry this build — so "already attached" is reported
    # as the success it is, rather than retried and logged as an error.
    already: set[str] = set()
    try:
        existing = call("GET", f"/v1/builds/{build_id}/relationships/betaGroups", bearer)
        already = {d["id"] for d in existing.get("data", [])}
    except urllib.error.HTTPError as exc:  # diagnostic only, never fatal
        print(f"  (could not read current groups for the build: HTTP {exc.code})")

    failures = 0
    for gid, name, all_builds in internal:
        if gid in already:
            print(f"Build {build_number} is already in {name!r}.")
            continue
        if all_builds:
            # Apple attaches these itself; an explicit POST is noise at best.
            print(f"{name!r} takes every build automatically — nothing to do.")
            continue
        try:
            call(
                "POST",
                f"/v1/betaGroups/{gid}/relationships/builds",
                bearer,
                {"data": [{"type": "builds", "id": build_id}]},
            )
            print(f"Added build {build_number} to {name!r}.")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:400]
            print(f"::warning::Could not add build to {name!r}: HTTP {exc.code} {detail}")
            failures += 1

    if failures and failures == len([g for g in internal if g[0] not in already]):
        print("::error::The build could not be added to any internal group.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

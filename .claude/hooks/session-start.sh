#!/bin/bash
set -euo pipefail

# SessionStart hook for HYBRID on Claude Code on the web.
#  1) installs workspace deps so tests / typecheck / build work in the fresh
#     ephemeral container;
#  2) generates the Prisma client, because installing is NOT enough for
#     typecheck to pass;
#  3) surfaces the open backlog (capabilities marked planned/blocked) into the
#     session context so acknowledged-but-unbuilt work isn't forgotten.
#
# Web-only: locally, deps already exist and context persists across runs.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# 1) Install deps. Logged (not echoed) so it can't corrupt the JSON on stdout.
if command -v pnpm >/dev/null 2>&1; then
  pnpm install >/tmp/hybrid-session-install.log 2>&1 || true

  # 2) GENERATE THE PRISMA CLIENT. Installing does not do this — there is no
  # postinstall hook, and only `build` runs it — so a fresh container has no
  # generated client and `pnpm --filter @hybrid/web typecheck` fails with 21
  # errors about SessionSet / SessionStream / SessionLap "not existing" on
  # PrismaClient. They exist in prisma/schema.prisma; the generated types
  # didn't. CI already does exactly this, for exactly this reason, immediately
  # before its typecheck step (.github/workflows/ci.yml).
  #
  # The cost of NOT doing it is worse than a failing command: those 21 errors
  # are indistinguishable from real ones, they name real files and real models,
  # and the obvious "fix" is to go edit working code. One session lost time to
  # deciding they were pre-existing and out of scope; the next might not.
  #
  # No database needed — `generate` reads the schema file only, which is why it
  # works in a sandbox where the Supabase host and Postgres ports are blocked.
  pnpm --filter @hybrid/web db:generate >/tmp/hybrid-session-prisma.log 2>&1 || true
fi

# 3) Emit the backlog as SessionStart additionalContext (best-effort).
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/backlog-context.mjs" 2>/dev/null || true

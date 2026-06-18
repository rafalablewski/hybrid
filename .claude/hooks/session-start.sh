#!/bin/bash
set -euo pipefail

# SessionStart hook for HYBRID on Claude Code on the web.
#  1) installs workspace deps so tests / typecheck / build work in the fresh
#     ephemeral container;
#  2) surfaces the open backlog (capabilities marked planned/blocked) into the
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
fi

# 2) Emit the backlog as SessionStart additionalContext (best-effort).
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/backlog-context.mjs" 2>/dev/null || true

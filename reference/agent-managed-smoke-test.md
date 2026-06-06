# Managed-runtime smoke test (durable memory)

The `managed` runtime can't be exercised from the build sandbox (the Claude API
and Supabase are out of reach there), so verify it once in a deployed
environment. Goal: confirm a `managed` agent **remembers across runs** via its
mounted memory store.

## Prerequisites
- [ ] `reference/sql-agents.sql`, `reference/sql-agent-runs.sql`, and
      `reference/sql-agent-schedules.sql` applied in Supabase.
- [ ] `ANTHROPIC_API_KEY` set in the Vercel server env (server-side only).
- [ ] The org/workspace behind that key has the **managed-agents beta** enabled.

## Steps
1. Admin console → **AI → AI agents**. Create an agent from the **CFO** preset
   (or any), set **Runtime = Managed (durable memory)**, set **Status = active**,
   and **Save**.
2. In the **Run** panel, run:
   > "Remember this for next time: our target gross margin is 72%. Acknowledge."
   - [ ] Output streams in and acknowledges.
   - [ ] First run is slower (it provisions the memory store + managed agent).
3. Run a **second** task in the same agent:
   > "What gross-margin target did I give you earlier?"
   - [ ] It answers **72%** — proving the memory store persisted across runs
         (separate sessions, same durable memory).
4. In Supabase, confirm the agent row now has non-null `managedAgentId` and
   `memoryStoreId` (created lazily on run 1, reused on run 2).
5. **AI → Agent runs**: both runs appear with status `ok` and token usage.

## Scheduled runs
6. On the same agent, add a **Schedule** (e.g. daily) with a standing task.
7. Either wait for the Vercel cron (see `apps/web/vercel.json`, default daily
   08:00 UTC), or trigger it manually:
   ```sh
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/agents
   ```
   - [ ] Response `{ "ran": N, ... }`.
   - [ ] A new run shows up in **Agent runs** with `ranByEmail = scheduler`.
   - [ ] The schedule's `lastRunAt`/`nextRunAt` advanced.

> Requires `CRON_SECRET` set in the Vercel env (Vercel Cron sends it as a Bearer
> token automatically). To run more often than daily, raise the cron frequency
> in `apps/web/vercel.json` (subject to your Vercel plan's cron limits).

## Rollback / cleanup
- Delete the test agent in the console (removes its config + schedules; runs are
  retained as history).
- The managed agent + memory store on Anthropic's side are reused per agent; to
  fully reset, clear `managedAgentId`/`memoryStoreId` on the row (a new pair is
  created on the next run).

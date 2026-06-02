-- HYBRID — Signal de-dup unique constraint.
-- Run in the Supabase SQL Editor. Prevents overlapping wearable syncs from
-- inserting duplicate readings (same userId + kind + ts + source), which would
-- corrupt rolling baselines. Pairs with skipDuplicates in the sync/video routes.
--
-- If duplicates already exist the index creation will fail — de-dupe first:
--   delete from "Signal" a using "Signal" b
--   where a.ctid < b.ctid
--     and a."userId" = b."userId" and a."kind" = b."kind"
--     and a."ts" = b."ts" and a."source" = b."source";

create unique index if not exists "Signal_userId_kind_ts_source_key"
  on "Signal" ("userId", "kind", "ts", "source");

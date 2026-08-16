-- SETS BECOME ROWS, AND STREAMS LAND AT ALL.
--
-- Two data-layer gaps, fixed while the tables are empty rather than under load:
--
--   SessionSet     A logged set lived only inside Session.blocks, a Json
--                  column. Postgres cannot see a value inside that document, so
--                  there was no per-set index and no per-set grain — every
--                  cross-athlete analytic loaded whole sessions into the lambda
--                  and walked them in TypeScript, under a `take:` cap that
--                  silently truncates the answer. This is the fact table: one
--                  row per strength SET and one per timed effort, denormalised
--                  with the athlete, the date and the archive flag so an
--                  aggregate never joins back. It is a PROJECTION of the
--                  document (core/session-facts.ts), written on every session
--                  write, and safe to drop and rebuild at any time — the
--                  document stays the source of truth.
--
--   SessionStream  Session.device carried a workout SUMMARY only: duration,
--   SessionLap     distance, kcal, avg/max HR. The richest device data — the
--                  heart-rate series, the GPS route, the laps and splits — never
--                  landed anywhere, and cannot be recovered later. A stream is
--                  ONE row per (session, kind) with parallel offsets/values
--                  arrays (a row per sample would be millions per athlete-year)
--                  plus the aggregates lifted into columns; a LAP gets a row
--                  each, because laps are tens per workout and "my fastest 5 km"
--                  has to be an indexed lookup rather than a scan of every
--                  recording. Shape + bounds: core/session-streams.ts.
--
-- Nothing here is destructive: three new tables, all cascade-deleted with their
-- Session and their User.
--
-- NOTE for production, whose migration bookkeeping is not yet reconciled (see
-- prisma/MIGRATIONS.md): run reference/sql-session-sets-streams.sql in the
-- Supabase SQL Editor instead of applying this migration — it is the same DDL
-- written idempotently, with the RLS layer this file does not cover.

-- CreateTable
CREATE TABLE "SessionSet" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "blockIndex" INTEGER NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "exercise" TEXT NOT NULL,
    "movement" TEXT,
    "muscles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "discipline" TEXT,
    "role" TEXT NOT NULL DEFAULT 'working',
    "drop" BOOLEAN NOT NULL DEFAULT false,
    "reps" INTEGER,
    "loadKg" DOUBLE PRECISION,
    "bodyweightKg" DOUBLE PRECISION,
    "effectiveLoadKg" DOUBLE PRECISION,
    "volumeKg" DOUBLE PRECISION,
    "e1rmKg" DOUBLE PRECISION,
    "rpe" DOUBLE PRECISION,
    "velocityMs" DOUBLE PRECISION,
    "peakVelocityMs" DOUBLE PRECISION,
    "romCm" DOUBLE PRECISION,
    "restSec" INTEGER,
    "distanceKm" DOUBLE PRECISION,
    "durationSec" INTEGER,
    "paceSecPerKm" DOUBLE PRECISION,
    "elevationM" DOUBLE PRECISION,
    "watts" DOUBLE PRECISION,
    "zone" INTEGER,
    "rounds" INTEGER,
    "measured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStream" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'apple',
    "uuid" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "offsets" INTEGER[],
    "values" DOUBLE PRECISION[],
    "valuesB" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "sampleCount" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "avg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionLap" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "kind" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "startOffsetSec" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgWatts" DOUBLE PRECISION,
    "elevationM" DOUBLE PRECISION,
    "paceSecPerKm" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSet_userId_performedAt_idx" ON "SessionSet"("userId", "performedAt");

-- CreateIndex
CREATE INDEX "SessionSet_userId_exercise_performedAt_idx" ON "SessionSet"("userId", "exercise", "performedAt");

-- CreateIndex
CREATE INDEX "SessionSet_exercise_performedAt_idx" ON "SessionSet"("exercise", "performedAt");

-- CreateIndex
CREATE INDEX "SessionSet_movement_performedAt_idx" ON "SessionSet"("movement", "performedAt");

-- CreateIndex
CREATE INDEX "SessionSet_discipline_performedAt_idx" ON "SessionSet"("discipline", "performedAt");

-- CreateIndex
CREATE INDEX "SessionSet_performedAt_idx" ON "SessionSet"("performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSet_sessionId_blockIndex_setIndex_key" ON "SessionSet"("sessionId", "blockIndex", "setIndex");

-- CreateIndex
CREATE INDEX "SessionStream_userId_performedAt_idx" ON "SessionStream"("userId", "performedAt");

-- CreateIndex
CREATE INDEX "SessionStream_kind_performedAt_idx" ON "SessionStream"("kind", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionStream_sessionId_kind_key" ON "SessionStream"("sessionId", "kind");

-- CreateIndex
CREATE INDEX "SessionLap_userId_performedAt_idx" ON "SessionLap"("userId", "performedAt");

-- CreateIndex
CREATE INDEX "SessionLap_userId_kind_distanceKm_durationSec_idx" ON "SessionLap"("userId", "kind", "distanceKm", "durationSec");

-- CreateIndex
CREATE INDEX "SessionLap_kind_distanceKm_durationSec_idx" ON "SessionLap"("kind", "distanceKm", "durationSec");

-- CreateIndex
CREATE UNIQUE INDEX "SessionLap_sessionId_kind_index_key" ON "SessionLap"("sessionId", "kind", "index");

-- AddForeignKey
ALTER TABLE "SessionSet" ADD CONSTRAINT "SessionSet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSet" ADD CONSTRAINT "SessionSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStream" ADD CONSTRAINT "SessionStream_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStream" ADD CONSTRAINT "SessionStream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionLap" ADD CONSTRAINT "SessionLap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "CheckinRead" (
    "id" TEXT NOT NULL,
    "checkinId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'energy',
    "value" INTEGER NOT NULL,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sinceSessionH" DOUBLE PRECISION,

    CONSTRAINT "CheckinRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CheckinRead_userId_loggedAt_idx" ON "CheckinRead"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "CheckinRead_checkinId_idx" ON "CheckinRead"("checkinId");

-- AddForeignKey
ALTER TABLE "CheckinRead" ADD CONSTRAINT "CheckinRead_checkinId_fkey" FOREIGN KEY ("checkinId") REFERENCES "Checkin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckinRead" ADD CONSTRAINT "CheckinRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the answer every existing day already carries, as its first read —
-- so the history isn't blank on the day this ships.
INSERT INTO "CheckinRead" ("id", "checkinId", "userId", "metric", "value", "loggedAt")
SELECT gen_random_uuid()::text, c."id", c."userId", 'energy', c."energy", COALESCE(c."createdAt", c."weekOf")
FROM "Checkin" c
WHERE c."energy" IS NOT NULL;

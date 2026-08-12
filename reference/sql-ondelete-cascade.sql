-- HYBRID — add ON DELETE rules to user/relationship foreign keys.
-- Run in the Supabase SQL Editor. Mirrors the onDelete: Cascade/SetNull added
-- to prisma/schema.prisma. Defense-in-depth: the app already deletes children
-- explicitly (admin user-delete + /account/reset), so this changes no app
-- behaviour — it guarantees a raw/RLS delete of a User (or Org/CoachLink) can't
-- orphan rows or be blocked by a dangling FK. Safe + idempotent to re-run.

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachLink" DROP CONSTRAINT IF EXISTS "CoachLink_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachLink" DROP CONSTRAINT IF EXISTS "CoachLink_clientId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachGroup" DROP CONSTRAINT IF EXISTS "CoachGroup_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachProgram" DROP CONSTRAINT IF EXISTS "CoachProgram_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachInvite" DROP CONSTRAINT IF EXISTS "CoachInvite_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachDiet" DROP CONSTRAINT IF EXISTS "CoachDiet_coachId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Checkin" DROP CONSTRAINT IF EXISTS "Checkin_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "WorkoutTemplate" DROP CONSTRAINT IF EXISTS "WorkoutTemplate_ownerId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_athleteId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Assignment" DROP CONSTRAINT IF EXISTS "Assignment_assignedById_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "CoachNote" DROP CONSTRAINT IF EXISTS "CoachNote_linkId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Session" DROP CONSTRAINT IF EXISTS "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Macrocycle" DROP CONSTRAINT IF EXISTS "Macrocycle_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Biometric" DROP CONSTRAINT IF EXISTS "Biometric_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Signal" DROP CONSTRAINT IF EXISTS "Signal_userId_fkey";

-- DropForeignKey

-- DropForeignKey

-- DropForeignKey

-- DropForeignKey
ALTER TABLE IF EXISTS "RtpProtocol" DROP CONSTRAINT IF EXISTS "RtpProtocol_userId_fkey";

-- DropForeignKey

-- DropForeignKey

-- DropForeignKey

-- DropForeignKey
ALTER TABLE IF EXISTS "RiskOutcome" DROP CONSTRAINT IF EXISTS "RiskOutcome_userId_fkey";

-- DropForeignKey
ALTER TABLE IF EXISTS "Connection" DROP CONSTRAINT IF EXISTS "Connection_userId_fkey";

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachLink" ADD CONSTRAINT "CoachLink_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachLink" ADD CONSTRAINT "CoachLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachGroup" ADD CONSTRAINT "CoachGroup_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachProgram" ADD CONSTRAINT "CoachProgram_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachInvite" ADD CONSTRAINT "CoachInvite_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachDiet" ADD CONSTRAINT "CoachDiet_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Checkin" ADD CONSTRAINT "Checkin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "WorkoutTemplate" ADD CONSTRAINT "WorkoutTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Assignment" ADD CONSTRAINT "Assignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Assignment" ADD CONSTRAINT "Assignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "CoachNote" ADD CONSTRAINT "CoachNote_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "CoachLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Macrocycle" ADD CONSTRAINT "Macrocycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Biometric" ADD CONSTRAINT "Biometric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
ALTER TABLE IF EXISTS "RtpProtocol" ADD CONSTRAINT "RtpProtocol_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
ALTER TABLE IF EXISTS "RiskOutcome" ADD CONSTRAINT "RiskOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE IF EXISTS "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


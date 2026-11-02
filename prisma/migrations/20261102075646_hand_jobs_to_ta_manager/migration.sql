-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "ta_manager_id" UUID,
ALTER COLUMN "recruiter_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "jobs_ta_manager_id_idx" ON "jobs"("ta_manager_id");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_ta_manager_id_fkey" FOREIGN KEY ("ta_manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (BR-HIR-021): a job without a recruiter is waiting for a Talent Acquisition Manager to choose one,
-- so it must have one recorded. Existing jobs all have a recruiter.
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiter_or_ta_manager_chk"
  CHECK ("recruiter_id" IS NOT NULL OR "ta_manager_id" IS NOT NULL);

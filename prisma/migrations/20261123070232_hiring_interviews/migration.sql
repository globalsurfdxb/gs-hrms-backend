-- CreateEnum
CREATE TYPE "interview_round" AS ENUM ('SCREENING_CALL', 'TECHNICAL', 'HR', 'FINAL');

-- CreateEnum
CREATE TYPE "interview_mode" AS ENUM ('IN_PERSON', 'TEAMS', 'PHONE');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "round" "interview_round" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "timezone" TEXT NOT NULL,
    "mode" "interview_mode" NOT NULL,
    "link" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "interview_status" NOT NULL DEFAULT 'SCHEDULED',
    "reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "scheduled_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_panel_members" (
    "interview_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "interview_panel_members_pkey" PRIMARY KEY ("interview_id","employee_id")
);

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_status_starts_at_idx" ON "interviews"("status", "starts_at");

-- CreateIndex
CREATE INDEX "interview_panel_members_employee_id_idx" ON "interview_panel_members"("employee_id");

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_scheduled_by_id_fkey" FOREIGN KEY ("scheduled_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panel_members" ADD CONSTRAINT "interview_panel_members_interview_id_fkey" FOREIGN KEY ("interview_id") REFERENCES "interviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_panel_members" ADD CONSTRAINT "interview_panel_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BR-HIR-010 (hand-written): the times agree with the duration, the duration is one the form offers, the link is
-- https, and notes stay a reasonable size.
ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_duration_chk" CHECK ("duration_min" IN (30, 45, 60, 90, 120)),
  ADD CONSTRAINT "interviews_ends_after_start_chk" CHECK ("ends_at" = "starts_at" + make_interval(mins => "duration_min")),
  ADD CONSTRAINT "interviews_link_https_chk" CHECK ("link" = '' OR "link" ~* '^https://'),
  ADD CONSTRAINT "interviews_notes_len_chk" CHECK (char_length("notes") <= 2000),
  ADD CONSTRAINT "interviews_reschedule_count_chk" CHECK ("reschedule_count" >= 0);

-- Panel clash lookups: scheduled interviews of a panelist by time.
CREATE INDEX "interview_panel_members_employee_interview_idx" ON "interview_panel_members"("employee_id", "interview_id");

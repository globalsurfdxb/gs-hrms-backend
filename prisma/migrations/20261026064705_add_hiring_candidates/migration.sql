-- CreateEnum
CREATE TYPE "candidate_source" AS ENUM ('LINKEDIN', 'NAUKRI', 'BAYT', 'INDEED', 'EMPLOYEE_REFERRAL', 'AGENCY', 'CAREERS_PAGE', 'DIRECT');

-- CreateEnum
CREATE TYPE "application_stage" AS ENUM ('APPLIED', 'SCREENING', 'TECHNICAL_INTERVIEW', 'HR_INTERVIEW', 'OFFER', 'HIRED');

-- CreateEnum
CREATE TYPE "application_exit" AS ENUM ('REJECTED', 'WITHDRAWN', 'ON_HOLD');

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_key" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "current_city" TEXT NOT NULL DEFAULT '',
    "current_company" TEXT NOT NULL DEFAULT '',
    "current_title" TEXT NOT NULL DEFAULT '',
    "experience_years" DECIMAL(4,1) NOT NULL,
    "notice_days" INTEGER NOT NULL DEFAULT 0,
    "current_salary" DECIMAL(14,2),
    "expected_salary" DECIMAL(14,2),
    "currency" CHAR(3) NOT NULL,
    "visa_status" TEXT NOT NULL DEFAULT '',
    "source" "candidate_source" NOT NULL,
    "referrer_id" UUID,
    "agency" TEXT,
    "cv_name" TEXT,
    "links" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "consent_given_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_notes" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "stage" "application_stage" NOT NULL DEFAULT 'APPLIED',
    "exit" "application_exit",
    "exit_from" "application_stage",
    "exit_reason" TEXT,
    "exit_note" TEXT,
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_stage_changes" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_label" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "application_stage_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_email_key" ON "candidates"("email");

-- CreateIndex
CREATE INDEX "candidates_phone_key_idx" ON "candidates"("phone_key");

-- CreateIndex
CREATE INDEX "candidates_location_id_idx" ON "candidates"("location_id");

-- CreateIndex
CREATE INDEX "candidates_referrer_id_idx" ON "candidates"("referrer_id");

-- CreateIndex
CREATE INDEX "candidate_notes_candidate_id_at_idx" ON "candidate_notes"("candidate_id", "at");

-- CreateIndex
CREATE INDEX "applications_job_id_stage_idx" ON "applications"("job_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "applications_candidate_id_job_id_key" ON "applications"("candidate_id", "job_id");

-- CreateIndex
CREATE INDEX "application_stage_changes_application_id_at_idx" ON "application_stage_changes"("application_id", "at");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_notes" ADD CONSTRAINT "candidate_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_changes" ADD CONSTRAINT "application_stage_changes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_stage_changes" ADD CONSTRAINT "application_stage_changes_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: rules the database also guards (BR-HIR-007/009; the service checks them first).
ALTER TABLE "candidates"
  ADD CONSTRAINT "candidates_email_lower_check" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "candidates_experience_check" CHECK ("experience_years" >= 0 AND "experience_years" <= 60),
  ADD CONSTRAINT "candidates_notice_check" CHECK ("notice_days" >= 0 AND "notice_days" <= 365),
  ADD CONSTRAINT "candidates_salary_check" CHECK (
    ("current_salary" IS NULL OR "current_salary" >= 0) AND ("expected_salary" IS NULL OR "expected_salary" >= 0)),
  ADD CONSTRAINT "candidates_tags_check" CHECK (cardinality("tags") <= 20),
  ADD CONSTRAINT "candidates_referral_check" CHECK ("source" <> 'EMPLOYEE_REFERRAL' OR "referrer_id" IS NOT NULL),
  ADD CONSTRAINT "candidates_agency_check" CHECK ("source" <> 'AGENCY' OR "agency" IS NOT NULL);

ALTER TABLE "applications"
  ADD CONSTRAINT "applications_exit_check" CHECK (("exit" IS NULL) = ("exit_from" IS NULL)),
  ADD CONSTRAINT "applications_hired_check" CHECK ("stage" <> 'HIRED' OR "exit" IS NULL);

-- Hand-written: notes and stage history are append-only, like job history and the audit log.
CREATE FUNCTION "hiring_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER "candidate_notes_no_update_delete" BEFORE UPDATE OR DELETE ON "candidate_notes"
  FOR EACH ROW EXECUTE FUNCTION "hiring_append_only"();
CREATE TRIGGER "application_stage_changes_no_update_delete" BEFORE UPDATE OR DELETE ON "application_stage_changes"
  FOR EACH ROW EXECUTE FUNCTION "hiring_append_only"();

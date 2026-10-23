-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED', 'FILLED');

-- Hand-written: JOB-0001 codes come from a sequence so concurrent saves never share a code.
CREATE SEQUENCE "hiring_job_code_seq" START 1;

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT ('JOB-'::text || lpad((nextval('hiring_job_code_seq'::regclass))::text, 4, '0'::text)),
    "requisition_id" UUID NOT NULL,
    "designation_id" UUID,
    "description" TEXT NOT NULL,
    "skills" TEXT[],
    "exp_min" INTEGER NOT NULL,
    "exp_max" INTEGER NOT NULL,
    "qualifications" TEXT NOT NULL DEFAULT '',
    "referral_eligible" BOOLEAN NOT NULL DEFAULT true,
    "closing_date" DATE NOT NULL,
    "recruiter_id" UUID NOT NULL,
    "filled" INTEGER NOT NULL DEFAULT 0,
    "status" "job_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_panel_members" (
    "job_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,

    CONSTRAINT "job_panel_members_pkey" PRIMARY KEY ("job_id","employee_id")
);

-- CreateTable
CREATE TABLE "job_events" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_label" TEXT NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_code_key" ON "jobs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_requisition_id_key" ON "jobs"("requisition_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_recruiter_id_idx" ON "jobs"("recruiter_id");

-- CreateIndex
CREATE INDEX "job_panel_members_employee_id_idx" ON "job_panel_members"("employee_id");

-- CreateIndex
CREATE INDEX "job_events_job_id_at_idx" ON "job_events"("job_id", "at");

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_recruiter_id_fkey" FOREIGN KEY ("recruiter_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_panel_members" ADD CONSTRAINT "job_panel_members_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_panel_members" ADD CONSTRAINT "job_panel_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: rules the database also guards (BR-HIR-005/006; the service checks them first).
ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_experience_check" CHECK ("exp_min" >= 0 AND "exp_max" >= "exp_min"),
  ADD CONSTRAINT "jobs_skills_check" CHECK (cardinality("skills") >= 1),
  ADD CONSTRAINT "jobs_filled_check" CHECK ("filled" >= 0);

-- Hand-written: job history is append-only, like the audit log.
CREATE FUNCTION "job_events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'job_events is append-only';
END;
$$;
CREATE TRIGGER "job_events_no_update" BEFORE UPDATE ON "job_events"
  FOR EACH ROW EXECUTE FUNCTION "job_events_append_only"();

ALTER SEQUENCE "hiring_job_code_seq" OWNED BY "jobs"."code";

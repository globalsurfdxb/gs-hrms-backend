-- CreateEnum
CREATE TYPE "hiring_employment_type" AS ENUM ('FULL_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "requisition_reason" AS ENUM ('NEW_ROLE', 'REPLACEMENT');

-- CreateEnum
CREATE TYPE "requisition_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "requisition_step_label" AS ENUM ('HIRING_MANAGER', 'HR', 'MANAGEMENT');

-- CreateEnum
CREATE TYPE "requisition_step_status" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED');

-- Hand-written: REQ-0001 codes come from a sequence so concurrent saves never share a code.
CREATE SEQUENCE "hiring_requisition_code_seq" START 1;

-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL DEFAULT ('REQ-'::text || lpad((nextval('hiring_requisition_code_seq'::regclass))::text, 4, '0'::text)),
    "title" TEXT NOT NULL,
    "company_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "designation_id" UUID,
    "location_id" TEXT NOT NULL,
    "positions" INTEGER NOT NULL,
    "employment_type" "hiring_employment_type" NOT NULL,
    "reason" "requisition_reason" NOT NULL,
    "replaces_employee_id" UUID,
    "budget_min" DECIMAL(14,2) NOT NULL,
    "budget_max" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "target_start" DATE NOT NULL,
    "hiring_manager_id" UUID NOT NULL,
    "justification" TEXT NOT NULL,
    "status" "requisition_status" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_steps" (
    "requisition_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" "requisition_step_label" NOT NULL,
    "status" "requisition_step_status" NOT NULL DEFAULT 'WAITING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "note" TEXT,

    CONSTRAINT "requisition_steps_pkey" PRIMARY KEY ("requisition_id","position")
);

-- CreateIndex
CREATE UNIQUE INDEX "requisitions_code_key" ON "requisitions"("code");

-- CreateIndex
CREATE INDEX "requisitions_status_idx" ON "requisitions"("status");

-- CreateIndex
CREATE INDEX "requisitions_location_id_idx" ON "requisitions"("location_id");

-- CreateIndex
CREATE INDEX "requisitions_hiring_manager_id_idx" ON "requisitions"("hiring_manager_id");

-- CreateIndex
CREATE INDEX "requisitions_created_by_id_idx" ON "requisitions"("created_by_id");

-- CreateIndex
CREATE INDEX "requisition_steps_label_status_idx" ON "requisition_steps"("label", "status");

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_designation_id_fkey" FOREIGN KEY ("designation_id") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_replaces_employee_id_fkey" FOREIGN KEY ("replaces_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_hiring_manager_id_fkey" FOREIGN KEY ("hiring_manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_steps" ADD CONSTRAINT "requisition_steps_requisition_id_fkey" FOREIGN KEY ("requisition_id") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_steps" ADD CONSTRAINT "requisition_steps_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: business rules the database also guards (BR-HIR-003; the service checks them first).
ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_positions_check" CHECK ("positions" >= 1),
  ADD CONSTRAINT "requisitions_budget_check" CHECK ("budget_min" > 0 AND "budget_max" >= "budget_min"),
  ADD CONSTRAINT "requisitions_replacement_check" CHECK ("reason" <> 'REPLACEMENT' OR "replaces_employee_id" IS NOT NULL);

ALTER SEQUENCE "hiring_requisition_code_seq" OWNED BY "requisitions"."code";

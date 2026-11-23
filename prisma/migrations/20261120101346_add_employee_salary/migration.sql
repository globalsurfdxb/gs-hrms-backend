-- CreateEnum
CREATE TYPE "salary_component_kind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateTable
CREATE TABLE "employee_salary_components" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "salary_component_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "employee_salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_salary_components_employee_id_idx" ON "employee_salary_components"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salary_components_employee_id_kind_label_key" ON "employee_salary_components"("employee_id", "kind", "label");

-- AddForeignKey
ALTER TABLE "employee_salary_components" ADD CONSTRAINT "employee_salary_components_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

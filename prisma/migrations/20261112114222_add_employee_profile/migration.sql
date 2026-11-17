-- CreateTable
CREATE TABLE "employee_profiles" (
    "employee_id" UUID NOT NULL,
    "first_name" TEXT,
    "middle_name" TEXT,
    "last_name" TEXT,
    "date_of_birth" DATE,
    "nationality" TEXT,
    "gender" TEXT,
    "marital_status" TEXT,
    "blood_group" TEXT,
    "personal_email" TEXT,
    "personal_mobile" TEXT,
    "current_address" TEXT,
    "permanent_address" TEXT,
    "work_phone" TEXT,
    "extension" TEXT,
    "seating_location" TEXT,
    "probation_end" DATE,
    "total_experience" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_profiles_pkey" PRIMARY KEY ("employee_id")
);

-- CreateTable
CREATE TABLE "employee_emergency_contacts" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "group" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,

    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_experience" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "from_date" DATE,
    "to_date" DATE,
    "title" TEXT NOT NULL DEFAULT '',
    "work_mode" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "employee_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_education" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "qualification" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT '',
    "course" TEXT NOT NULL DEFAULT '',
    "field" TEXT NOT NULL DEFAULT '',
    "start_year" INTEGER,
    "end_year" INTEGER,

    CONSTRAINT "employee_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_family" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "occupation" TEXT NOT NULL DEFAULT '',
    "date_of_birth" DATE,

    CONSTRAINT "employee_family_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_emergency_contacts_employee_id_idx" ON "employee_emergency_contacts"("employee_id");

-- CreateIndex
CREATE INDEX "employee_experience_employee_id_idx" ON "employee_experience"("employee_id");

-- CreateIndex
CREATE INDEX "employee_education_employee_id_idx" ON "employee_education"("employee_id");

-- CreateIndex
CREATE INDEX "employee_family_employee_id_idx" ON "employee_family"("employee_id");

-- AddForeignKey
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_emergency_contacts" ADD CONSTRAINT "employee_emergency_contacts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_experience" ADD CONSTRAINT "employee_experience_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_family" ADD CONSTRAINT "employee_family_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: the fixed lists from the frontend (lib/options.ts). The DTOs validate first; these are the backstop.
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_gender_check" CHECK ("gender" IN ('Male', 'Female', 'Other'));
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_marital_status_check" CHECK ("marital_status" IN ('Single', 'Married', 'Divorced', 'Widowed'));
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_blood_group_check" CHECK ("blood_group" IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'));
ALTER TABLE "employee_experience" ADD CONSTRAINT "employee_experience_work_mode_check" CHECK ("work_mode" IN ('', 'Onsite', 'Remote', 'Hybrid'));
ALTER TABLE "employee_experience" ADD CONSTRAINT "employee_experience_dates_check" CHECK ("to_date" IS NULL OR "from_date" IS NULL OR "to_date" >= "from_date");
ALTER TABLE "employee_education" ADD CONSTRAINT "employee_education_years_check" CHECK ("end_year" IS NULL OR "start_year" IS NULL OR "end_year" >= "start_year");

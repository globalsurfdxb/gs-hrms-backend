-- CreateTable
CREATE TABLE "employee_identity_bank" (
    "employee_id" UUID NOT NULL,
    "passport_number_enc" TEXT,
    "passport_expiry" DATE,
    "passport_name" TEXT,
    "emirates_id_enc" TEXT,
    "emirates_id_expiry" DATE,
    "visa_expiry" DATE,
    "labour_card_issue" DATE,
    "labour_card_expiry" DATE,
    "aadhaar_enc" TEXT,
    "aadhaar_name" TEXT,
    "pan_enc" TEXT,
    "pan_name" TEXT,
    "uan_enc" TEXT,
    "pf_enrolled" TEXT,
    "uan_mobile" TEXT,
    "pf_member_id" TEXT,
    "eps_eligibility" TEXT,
    "payment_mode" TEXT,
    "bank_name" TEXT,
    "account_name" TEXT,
    "account_number_enc" TEXT,
    "branch_code" TEXT,
    "branch_name" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_identity_bank_pkey" PRIMARY KEY ("employee_id")
);

-- AddForeignKey
ALTER TABLE "employee_identity_bank" ADD CONSTRAINT "employee_identity_bank_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

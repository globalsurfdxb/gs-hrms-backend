-- AlterTable
ALTER TABLE "requisitions" ADD COLUMN     "proposed_designation" VARCHAR(80);

-- BR-HIR-020 (hand-written): a proposed title is 2–80 characters, and until approval it replaces the designation —
-- a requisition never asks for both. Once approved the proposed title is kept and designation_id points to the
-- designation it became.
ALTER TABLE "requisitions"
  ADD CONSTRAINT "requisitions_proposed_designation_chk" CHECK (
    "proposed_designation" IS NULL
    OR (
      char_length(btrim("proposed_designation")) BETWEEN 2 AND 80
      AND ("designation_id" IS NULL OR "status" IN ('APPROVED', 'ON_HOLD', 'CLOSED'))
    )
  );

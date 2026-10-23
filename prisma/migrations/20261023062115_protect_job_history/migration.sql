-- DropForeignKey
ALTER TABLE "job_events" DROP CONSTRAINT "job_events_job_id_fkey";

-- AddForeignKey
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: job history is append-only like audit_logs — block DELETE as well as UPDATE.
DROP TRIGGER "job_events_no_update" ON "job_events";
CREATE TRIGGER "job_events_no_update_delete" BEFORE UPDATE OR DELETE ON "job_events"
  FOR EACH ROW EXECUTE FUNCTION "job_events_append_only"();

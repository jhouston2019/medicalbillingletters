-- Run in Supabase SQL editor if the dashboard query returns no rows but rows exist in the table.
-- Verify linking first:
--   select id, user_id, paid, is_unlocked from medical_bill_jobs order by created_at desc limit 5;
-- The paid job row must have user_id = auth.users.id for that login.

ALTER TABLE medical_bill_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own jobs" ON medical_bill_jobs;

CREATE POLICY "Users can view own jobs"
ON medical_bill_jobs
FOR SELECT
USING (auth.uid() = user_id);

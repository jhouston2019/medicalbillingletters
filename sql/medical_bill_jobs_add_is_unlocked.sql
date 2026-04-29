-- Run once in Supabase SQL editor if you already created medical_bill_jobs without is_unlocked.

ALTER TABLE medical_bill_jobs ADD COLUMN IF NOT EXISTS is_unlocked BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE medical_bill_jobs SET is_unlocked = true WHERE paid = true;

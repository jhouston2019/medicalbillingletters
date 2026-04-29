-- Run once in Supabase if medical_bill_jobs exists without stripe_session_id (checkout unlock writes).
ALTER TABLE medical_bill_jobs ADD COLUMN IF NOT EXISTS stripe_session_id TEXT;

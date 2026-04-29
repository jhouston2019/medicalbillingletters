-- Run in Supabase SQL editor once. Service role (Netlify functions) performs reads/writes.

CREATE TABLE IF NOT EXISTS medical_bill_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  analysis_json JSONB NOT NULL,
  strategy_json JSONB NOT NULL,
  wizard_json JSONB NOT NULL,
  letter_full TEXT NOT NULL DEFAULT '',
  preview_text TEXT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  stripe_checkout_session_id TEXT UNIQUE,
  hard_stop BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_medical_bill_jobs_user_id ON medical_bill_jobs (user_id);

COMMENT ON TABLE medical_bill_jobs IS 'Guest/paid medical bill wizard jobs; letter unlock after Stripe verification.';

-- ============================================================================
-- MASTER MIGRATION - RUN THIS ONCE IN SUPABASE SQL EDITOR
-- Insurance Claim Letter Help - Complete Database Setup
-- ============================================================================
-- This combines all migrations into one file for easy execution
-- Run this in Supabase Dashboard > SQL Editor > New Query
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE CLAIM_LETTERS TABLE (Complete Schema)
-- ============================================================================

-- Drop old incomplete table if exists
DROP TABLE IF EXISTS public.cla_letters CASCADE;

-- Create complete claim_letters table
CREATE TABLE IF NOT EXISTS public.claim_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  
  -- File information
  file_name text NOT NULL,
  file_path text NOT NULL,
  original_filename text,
  
  -- Extracted content
  letter_text text,
  extracted_text text,
  
  -- Classification data
  claim_type text,
  party_type text,
  claim_context text,
  claim_amount text,
  
  -- Analysis results
  analysis jsonb,
  summary text,
  phase text,
  risk_level text,
  
  -- Generated response
  ai_response text,
  generated_letter text,
  
  -- Payment tracking
  stripe_session_id text,
  stripe_payment_status text DEFAULT 'pending',
  payment_status text DEFAULT 'pending',
  
  -- Usage tracking (ONE LETTER PER PAYMENT)
  letter_generated boolean DEFAULT false,
  letter_generated_at timestamp,
  
  -- Status tracking
  status text DEFAULT 'uploaded',
  
  -- Timestamps
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- ============================================================================
-- PART 2: ADD CONSTRAINTS (Hard Business Logic)
-- ============================================================================

-- CRITICAL: One letter per payment (database-enforced)
-- Add constraint only if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'one_letter_per_payment'
  ) THEN
    ALTER TABLE public.claim_letters 
    ADD CONSTRAINT one_letter_per_payment UNIQUE (stripe_session_id);
  END IF;
END $$;

-- ============================================================================
-- PART 3: CREATE INDEXES (Performance)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_id 
ON public.claim_letters(user_id);

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_email 
ON public.claim_letters(user_email);

CREATE INDEX IF NOT EXISTS idx_claim_letters_status 
ON public.claim_letters(status);

CREATE INDEX IF NOT EXISTS idx_claim_letters_stripe_session 
ON public.claim_letters(stripe_session_id);

CREATE INDEX IF NOT EXISTS idx_claim_letters_created_at 
ON public.claim_letters(created_at);

CREATE INDEX IF NOT EXISTS idx_claim_letters_letter_generated 
ON public.claim_letters(letter_generated);

CREATE INDEX IF NOT EXISTS idx_claim_letters_payment_status 
ON public.claim_letters(payment_status);

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_payment 
ON public.claim_letters(user_id, payment_status, letter_generated);

-- ============================================================================
-- PART 4: ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS only if not already enabled
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = 'claim_letters' AND rowsecurity = true
  ) THEN
    ALTER TABLE public.claim_letters ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can insert own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can update own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can delete own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Service role full access" ON public.claim_letters;

-- RLS Policies for claim_letters
CREATE POLICY "Users can view own claim letters" ON public.claim_letters
    FOR SELECT USING (
        auth.uid() = user_id OR 
        auth.email() = user_email
    );

CREATE POLICY "Users can insert own claim letters" ON public.claim_letters
    FOR INSERT WITH CHECK (
        auth.uid() = user_id OR 
        auth.email() = user_email
    );

CREATE POLICY "Users can update own claim letters" ON public.claim_letters
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        auth.email() = user_email
    );

CREATE POLICY "Users can delete own claim letters" ON public.claim_letters
    FOR DELETE USING (
        auth.uid() = user_id OR 
        auth.email() = user_email
    );

-- Service role can do everything (for backend functions)
CREATE POLICY "Service role full access" ON public.claim_letters
    FOR ALL USING (
        auth.jwt()->>'role' = 'service_role'
    );

-- ============================================================================
-- PART 5: CREATE UPDATED_AT TRIGGER
-- ============================================================================

-- Create function (CREATE OR REPLACE handles existing)
CREATE OR REPLACE FUNCTION public.update_claim_letters_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS update_claim_letters_updated_at ON public.claim_letters;

CREATE TRIGGER update_claim_letters_updated_at
  BEFORE UPDATE ON public.claim_letters
  FOR EACH ROW EXECUTE PROCEDURE public.update_claim_letters_updated_at();

-- ============================================================================
-- PART 6: CREATE STORAGE BUCKET
-- ============================================================================

-- Create storage bucket for claim letters if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-letters', 'claim-letters', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ============================================================================
-- PART 7: STORAGE RLS POLICIES (Lock Down Storage)
-- ============================================================================

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can upload own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own claim files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload to own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Service role has full access" ON storage.objects;

-- STRICT STORAGE POLICIES: User can only access their own folder

-- Upload policy: Users can only upload to their own user_id folder
CREATE POLICY "Users can upload to own folder only" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- View policy: Users can only view files in their own folder
CREATE POLICY "Users can view own folder only" ON storage.objects
FOR SELECT USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Update policy: Users can only update files in their own folder
CREATE POLICY "Users can update own folder only" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Delete policy: Users can only delete files in their own folder
CREATE POLICY "Users can delete own folder only" ON storage.objects
FOR DELETE USING (
  bucket_id = 'claim-letters' AND 
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Service role has full access (for backend functions)
CREATE POLICY "Service role has full access" ON storage.objects
FOR ALL USING (
  auth.jwt()->>'role' = 'service_role'
);

-- ============================================================================
-- PART 8: ADD COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE public.claim_letters IS 
'Insurance claim letters with complete tracking, payment enforcement, and one-letter-per-payment constraint';

COMMENT ON COLUMN public.claim_letters.letter_generated IS 
'Flag to track if letter has been generated for this payment (one payment = one letter)';

COMMENT ON COLUMN public.claim_letters.letter_generated_at IS 
'Timestamp when letter was generated';

COMMENT ON CONSTRAINT one_letter_per_payment ON public.claim_letters IS 
'Database-level enforcement: One Stripe session can only be used for one letter';

-- ============================================================================
-- VERIFICATION QUERIES (Run these after to confirm)
-- ============================================================================

-- Check if table exists and has all columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'claim_letters'
ORDER BY ordinal_position;

-- Check if constraints exist
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'claim_letters';

-- Check if indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'claim_letters';

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'claim_letters';

-- Check if storage bucket exists
SELECT id, name, public 
FROM storage.buckets 
WHERE id = 'claim-letters';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$ 
BEGIN 
  RAISE NOTICE '✅ MIGRATION COMPLETE';
  RAISE NOTICE 'Table: claim_letters created';
  RAISE NOTICE 'Constraint: one_letter_per_payment active';
  RAISE NOTICE 'RLS: Enabled with policies';
  RAISE NOTICE 'Storage: claim-letters bucket created (private)';
  RAISE NOTICE 'Indexes: 8 performance indexes created';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Database is ready for production';
END $$;

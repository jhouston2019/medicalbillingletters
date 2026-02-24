-- Add letter_generated flag to prevent payment reuse
-- This ensures one payment = one letter

ALTER TABLE public.claim_letters 
ADD COLUMN IF NOT EXISTS letter_generated boolean DEFAULT false;

ALTER TABLE public.claim_letters 
ADD COLUMN IF NOT EXISTS letter_generated_at timestamp;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_claim_letters_letter_generated 
ON public.claim_letters(letter_generated);

-- Add unique constraint on stripe_session_id to prevent reuse
ALTER TABLE public.claim_letters 
ADD CONSTRAINT unique_stripe_session_id UNIQUE (stripe_session_id);

COMMENT ON COLUMN public.claim_letters.letter_generated IS 
'Flag to track if letter has been generated for this payment (one payment = one letter)';

COMMENT ON COLUMN public.claim_letters.letter_generated_at IS 
'Timestamp when letter was generated';

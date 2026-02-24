-- Add letter_generated flag to prevent payment reuse
-- This ensures one payment = one letter

ALTER TABLE public.claim_letters 
ADD COLUMN IF NOT EXISTS letter_generated boolean DEFAULT false;

ALTER TABLE public.claim_letters 
ADD COLUMN IF NOT EXISTS letter_generated_at timestamp;

-- HARD BUSINESS LOGIC: One letter per payment (database-enforced)
ALTER TABLE public.claim_letters 
ADD CONSTRAINT one_letter_per_payment UNIQUE (stripe_session_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_claim_letters_letter_generated 
ON public.claim_letters(letter_generated);

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_id 
ON public.claim_letters(user_id);

CREATE INDEX IF NOT EXISTS idx_claim_letters_payment_status 
ON public.claim_letters(payment_status);

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_payment 
ON public.claim_letters(user_id, payment_status, letter_generated);

COMMENT ON COLUMN public.claim_letters.letter_generated IS 
'Flag to track if letter has been generated for this payment (one payment = one letter)';

COMMENT ON COLUMN public.claim_letters.letter_generated_at IS 
'Timestamp when letter was generated';

COMMENT ON CONSTRAINT one_letter_per_payment ON public.claim_letters IS 
'Database-level enforcement: One Stripe session can only be used for one letter';

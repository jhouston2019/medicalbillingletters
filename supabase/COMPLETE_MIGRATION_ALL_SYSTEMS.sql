-- ============================================================================
-- COMPLETE MIGRATION - ALL SYSTEMS
-- Run this ONCE in Supabase SQL Editor
-- ============================================================================
-- Includes:
-- 1. Base claim_letters table (MASTER_MIGRATION_RUN_THIS.sql)
-- 2. Quality systems (citation, quality, outcomes, logging, A/B tests)
-- 3. Admin system (authentication, dashboard)
-- ============================================================================

-- ============================================================================
-- PART 1: BASE CLAIM_LETTERS TABLE
-- ============================================================================

DROP TABLE IF EXISTS public.cla_letters CASCADE;

CREATE TABLE IF NOT EXISTS public.claim_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  
  file_name text NOT NULL,
  file_path text NOT NULL,
  original_filename text,
  
  letter_text text,
  extracted_text text,
  
  claim_type text,
  party_type text,
  claim_context text,
  claim_amount text,
  
  analysis jsonb,
  summary text,
  phase text,
  risk_level text,
  
  ai_response text,
  generated_letter text,
  
  stripe_session_id text,
  stripe_payment_status text DEFAULT 'pending',
  payment_status text DEFAULT 'pending',
  
  letter_generated boolean DEFAULT false,
  letter_generated_at timestamp,
  
  status text DEFAULT 'uploaded',
  
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'one_letter_per_payment') THEN
    ALTER TABLE public.claim_letters ADD CONSTRAINT one_letter_per_payment UNIQUE (stripe_session_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_claim_letters_user_id ON public.claim_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_claim_letters_user_email ON public.claim_letters(user_email);
CREATE INDEX IF NOT EXISTS idx_claim_letters_status ON public.claim_letters(status);
CREATE INDEX IF NOT EXISTS idx_claim_letters_stripe_session ON public.claim_letters(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_claim_letters_created_at ON public.claim_letters(created_at);
CREATE INDEX IF NOT EXISTS idx_claim_letters_letter_generated ON public.claim_letters(letter_generated);
CREATE INDEX IF NOT EXISTS idx_claim_letters_payment_status ON public.claim_letters(payment_status);
CREATE INDEX IF NOT EXISTS idx_claim_letters_user_payment ON public.claim_letters(user_id, payment_status, letter_generated);

ALTER TABLE public.claim_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can insert own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can update own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Users can delete own claim letters" ON public.claim_letters;
DROP POLICY IF EXISTS "Service role full access" ON public.claim_letters;

CREATE POLICY "Users can view own claim letters" ON public.claim_letters
FOR SELECT USING (auth.uid() = user_id OR auth.email() = user_email);

CREATE POLICY "Users can insert own claim letters" ON public.claim_letters
FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.email() = user_email);

CREATE POLICY "Users can update own claim letters" ON public.claim_letters
FOR UPDATE USING (auth.uid() = user_id OR auth.email() = user_email);

CREATE POLICY "Users can delete own claim letters" ON public.claim_letters
FOR DELETE USING (auth.uid() = user_id OR auth.email() = user_email);

CREATE POLICY "Service role full access" ON public.claim_letters
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.update_claim_letters_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_claim_letters_updated_at ON public.claim_letters;

CREATE TRIGGER update_claim_letters_updated_at
  BEFORE UPDATE ON public.claim_letters
  FOR EACH ROW EXECUTE PROCEDURE public.update_claim_letters_updated_at();

INSERT INTO storage.buckets (id, name, public)
VALUES ('claim-letters', 'claim-letters', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Users can upload to own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own folder only" ON storage.objects;
DROP POLICY IF EXISTS "Service role has full access" ON storage.objects;

CREATE POLICY "Users can upload to own folder only" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'claim-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own folder only" ON storage.objects
FOR SELECT USING (bucket_id = 'claim-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own folder only" ON storage.objects
FOR UPDATE USING (bucket_id = 'claim-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own folder only" ON storage.objects
FOR DELETE USING (bucket_id = 'claim-letters' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Service role has full access" ON storage.objects
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 2: QUALITY SYSTEMS TABLES
-- ============================================================================

-- Citation Verifications
CREATE TABLE IF NOT EXISTS public.citation_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.claim_letters(id) ON DELETE CASCADE,
  total_citations integer DEFAULT 0,
  verified_citations integer DEFAULT 0,
  accurate_citations integer DEFAULT 0,
  unverified_citations integer DEFAULT 0,
  accuracy_rate integer,
  quality_score integer,
  has_hallucinations boolean DEFAULT false,
  hallucination_count integer DEFAULT 0,
  hallucination_details jsonb,
  citations jsonb,
  warnings text[],
  recommendations text[],
  passes_verification boolean DEFAULT false,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citation_verifications_document ON public.citation_verifications(document_id);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_quality ON public.citation_verifications(quality_score);
CREATE INDEX IF NOT EXISTS idx_citation_verifications_created ON public.citation_verifications(created_at);

ALTER TABLE public.citation_verifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own citation verifications" ON public.citation_verifications;
CREATE POLICY "Users can view own citation verifications" ON public.citation_verifications
FOR SELECT USING (document_id IN (SELECT id FROM public.claim_letters WHERE user_id = auth.uid() OR user_email = auth.email()));

DROP POLICY IF EXISTS "Service role full access to citation_verifications" ON public.citation_verifications;
CREATE POLICY "Service role full access to citation_verifications" ON public.citation_verifications
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Quality Metrics
CREATE TABLE IF NOT EXISTS public.quality_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.claim_letters(id) ON DELETE CASCADE,
  overall_score integer,
  quality_grade text,
  generic_language_score integer,
  generic_phrases_found integer,
  specificity_score integer,
  specificity_elements_found integer,
  professionalism_score integer,
  emotional_language_count integer,
  adversarial_language_count integer,
  structure_score integer,
  structure_elements_found integer,
  ready_to_send boolean DEFAULT false,
  should_regenerate boolean DEFAULT false,
  must_regenerate boolean DEFAULT false,
  improvement_suggestions text[],
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quality_metrics_document ON public.quality_metrics(document_id);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_overall ON public.quality_metrics(overall_score);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_grade ON public.quality_metrics(quality_grade);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_created ON public.quality_metrics(created_at);

ALTER TABLE public.quality_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own quality metrics" ON public.quality_metrics;
CREATE POLICY "Users can view own quality metrics" ON public.quality_metrics
FOR SELECT USING (document_id IN (SELECT id FROM public.claim_letters WHERE user_id = auth.uid() OR user_email = auth.email()));

DROP POLICY IF EXISTS "Service role full access to quality_metrics" ON public.quality_metrics;
CREATE POLICY "Service role full access to quality_metrics" ON public.quality_metrics
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Outcome Tracking
CREATE TABLE IF NOT EXISTS public.outcome_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES public.claim_letters(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome_status text DEFAULT 'pending',
  outcome_result text,
  letter_sent_date date,
  response_received_date date,
  resolution_date date,
  days_to_response integer,
  days_to_resolution integer,
  claim_amount numeric(10,2),
  resolution_amount numeric(10,2),
  recovery_percentage numeric(5,2),
  user_satisfaction integer CHECK (user_satisfaction BETWEEN 1 AND 5),
  user_feedback text,
  citation_quality_score integer,
  output_quality_score integer,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_tracking_document ON public.outcome_tracking(document_id);
CREATE INDEX IF NOT EXISTS idx_outcome_tracking_user ON public.outcome_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_outcome_tracking_status ON public.outcome_tracking(outcome_status);
CREATE INDEX IF NOT EXISTS idx_outcome_tracking_result ON public.outcome_tracking(outcome_result);
CREATE INDEX IF NOT EXISTS idx_outcome_tracking_created ON public.outcome_tracking(created_at);

ALTER TABLE public.outcome_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own outcomes" ON public.outcome_tracking;
CREATE POLICY "Users can view own outcomes" ON public.outcome_tracking
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access to outcome_tracking" ON public.outcome_tracking;
CREATE POLICY "Service role full access to outcome_tracking" ON public.outcome_tracking
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.update_outcome_tracking_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_outcome_tracking_updated_at ON public.outcome_tracking;
CREATE TRIGGER update_outcome_tracking_updated_at
  BEFORE UPDATE ON public.outcome_tracking
  FOR EACH ROW EXECUTE PROCEDURE public.update_outcome_tracking_updated_at();

-- Structured Logs
CREATE TABLE IF NOT EXISTS public.structured_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_level text NOT NULL,
  event_type text NOT NULL,
  message text,
  context jsonb,
  user_id uuid,
  document_id uuid,
  session_id text,
  duration_ms integer,
  tokens_used integer,
  cost_usd numeric(10,6),
  error_details jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_structured_logs_level ON public.structured_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_structured_logs_event ON public.structured_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_structured_logs_user ON public.structured_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_structured_logs_document ON public.structured_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_structured_logs_created ON public.structured_logs(created_at);

ALTER TABLE public.structured_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to structured_logs" ON public.structured_logs;
CREATE POLICY "Service role full access to structured_logs" ON public.structured_logs
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- A/B Test Experiments
CREATE TABLE IF NOT EXISTS public.ab_test_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_name text UNIQUE NOT NULL,
  description text,
  status text DEFAULT 'draft',
  control_variant text NOT NULL,
  test_variant text NOT NULL,
  traffic_percentage integer DEFAULT 50,
  configuration jsonb,
  started_at timestamp,
  completed_at timestamp,
  winner_variant text,
  statistical_significance numeric(5,4),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_experiments_name ON public.ab_test_experiments(experiment_name);
CREATE INDEX IF NOT EXISTS idx_ab_experiments_status ON public.ab_test_experiments(status);

ALTER TABLE public.ab_test_experiments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to ab_test_experiments" ON public.ab_test_experiments;
CREATE POLICY "Service role full access to ab_test_experiments" ON public.ab_test_experiments
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.update_ab_test_experiments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ab_test_experiments_updated_at ON public.ab_test_experiments;
CREATE TRIGGER update_ab_test_experiments_updated_at
  BEFORE UPDATE ON public.ab_test_experiments
  FOR EACH ROW EXECUTE PROCEDURE public.update_ab_test_experiments_updated_at();

-- A/B Test Assignments
CREATE TABLE IF NOT EXISTS public.ab_test_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid REFERENCES public.ab_test_experiments(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.claim_letters(id) ON DELETE CASCADE,
  user_id uuid,
  assigned_variant text NOT NULL,
  quality_score integer,
  citation_score integer,
  outcome_result text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_experiment ON public.ab_test_assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_document ON public.ab_test_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant ON public.ab_test_assignments(assigned_variant);

ALTER TABLE public.ab_test_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to ab_test_assignments" ON public.ab_test_assignments;
CREATE POLICY "Service role full access to ab_test_assignments" ON public.ab_test_assignments
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Prompt Versions
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_name text NOT NULL,
  version integer NOT NULL,
  prompt_text text NOT NULL,
  is_active boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  avg_quality_score numeric(5,2),
  avg_citation_score numeric(5,2),
  success_rate numeric(5,2),
  created_at timestamp DEFAULT now(),
  UNIQUE(prompt_name, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_name ON public.prompt_versions(prompt_name);
CREATE INDEX IF NOT EXISTS idx_prompt_versions_active ON public.prompt_versions(is_active);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to prompt_versions" ON public.prompt_versions;
CREATE POLICY "Service role full access to prompt_versions" ON public.prompt_versions
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Quality Benchmarks
CREATE TABLE IF NOT EXISTS public.quality_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_date date NOT NULL,
  avg_quality_score numeric(5,2),
  avg_citation_accuracy numeric(5,2),
  success_rate numeric(5,2),
  total_documents integer,
  created_at timestamp DEFAULT now(),
  UNIQUE(benchmark_date)
);

CREATE INDEX IF NOT EXISTS idx_quality_benchmarks_date ON public.quality_benchmarks(benchmark_date);

ALTER TABLE public.quality_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to quality_benchmarks" ON public.quality_benchmarks;
CREATE POLICY "Service role full access to quality_benchmarks" ON public.quality_benchmarks
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 3: ADMIN SYSTEM TABLES
-- ============================================================================

-- Admin Users
CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active boolean DEFAULT true,
  last_login_at timestamp,
  login_count integer DEFAULT 0,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON public.admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_is_active ON public.admin_users(is_active);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to admin_users" ON public.admin_users;
CREATE POLICY "Service role full access to admin_users" ON public.admin_users
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE OR REPLACE FUNCTION public.update_admin_users_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE PROCEDURE public.update_admin_users_updated_at();

-- Admin Sessions
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON public.admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user ON public.admin_sessions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON public.admin_sessions(expires_at);

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to admin_sessions" ON public.admin_sessions;
CREATE POLICY "Service role full access to admin_sessions" ON public.admin_sessions
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Admin Activity Log
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb,
  ip_address text,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_admin_user ON public.admin_activity_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON public.admin_activity_log(created_at);

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to admin_activity_log" ON public.admin_activity_log;
CREATE POLICY "Service role full access to admin_activity_log" ON public.admin_activity_log
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 4: ANALYTICS FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_success_rate_by_claim_type(claim_type_param text)
RETURNS TABLE (
  claim_type text,
  total_outcomes bigint,
  successful_outcomes bigint,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ot.claim_type::text,
    COUNT(*)::bigint as total_outcomes,
    COUNT(*) FILTER (WHERE ot.outcome_result = 'success')::bigint as successful_outcomes,
    ROUND(
      (COUNT(*) FILTER (WHERE ot.outcome_result = 'success')::numeric / 
       NULLIF(COUNT(*), 0)::numeric) * 100, 
      2
    ) as success_rate
  FROM (
    SELECT 
      cl.claim_type,
      ot.outcome_result
    FROM public.outcome_tracking ot
    JOIN public.claim_letters cl ON ot.document_id = cl.id
    WHERE cl.claim_type = claim_type_param
      AND ot.outcome_result IS NOT NULL
  ) ot
  GROUP BY ot.claim_type;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_quality_statistics()
RETURNS TABLE (
  avg_overall_score numeric,
  avg_citation_accuracy numeric,
  total_documents bigint,
  high_quality_count bigint,
  high_quality_percentage numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ROUND(AVG(qm.overall_score), 2) as avg_overall_score,
    ROUND(AVG(cv.accuracy_rate), 2) as avg_citation_accuracy,
    COUNT(DISTINCT qm.document_id)::bigint as total_documents,
    COUNT(*) FILTER (WHERE qm.overall_score >= 85)::bigint as high_quality_count,
    ROUND(
      (COUNT(*) FILTER (WHERE qm.overall_score >= 85)::numeric / 
       NULLIF(COUNT(*), 0)::numeric) * 100, 
      2
    ) as high_quality_percentage
  FROM public.quality_metrics qm
  LEFT JOIN public.citation_verifications cv ON qm.document_id = cv.document_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 5: ADMIN DASHBOARD VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days') as new_users_7d,
  (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '30 days') as new_users_30d,
  (SELECT COUNT(*) FROM public.claim_letters) as total_documents,
  (SELECT COUNT(*) FROM public.claim_letters WHERE created_at > now() - interval '7 days') as new_documents_7d,
  (SELECT COUNT(*) FROM public.claim_letters WHERE letter_generated = true) as letters_generated,
  (SELECT COUNT(*) FROM public.claim_letters WHERE payment_status = 'completed') as paid_documents,
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed') as total_revenue,
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed' AND created_at > now() - interval '7 days') as revenue_7d,
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed' AND created_at > now() - interval '30 days') as revenue_30d,
  (SELECT COALESCE(AVG(overall_score), 0) FROM public.quality_metrics WHERE created_at > now() - interval '7 days') as avg_quality_7d,
  (SELECT COALESCE(AVG(accuracy_rate), 0) FROM public.citation_verifications WHERE created_at > now() - interval '7 days') as avg_citation_accuracy_7d,
  (SELECT COUNT(*) FROM public.outcome_tracking WHERE outcome_result = 'success') as successful_outcomes,
  (SELECT COUNT(*) FROM public.outcome_tracking WHERE outcome_result IN ('success', 'partial_success', 'failure', 'settled')) as total_outcomes,
  (SELECT COUNT(*) FROM public.structured_logs WHERE log_level = 'error' AND created_at > now() - interval '24 hours') as errors_24h,
  (SELECT COUNT(*) FROM public.structured_logs WHERE log_level = 'critical' AND created_at > now() - interval '24 hours') as critical_errors_24h;

CREATE OR REPLACE VIEW admin_recent_activity AS
SELECT
  cl.id,
  cl.user_email,
  cl.claim_type,
  cl.phase,
  cl.payment_status,
  cl.letter_generated,
  cl.status,
  cl.created_at,
  qm.overall_score as quality_score,
  cv.accuracy_rate as citation_accuracy,
  ot.outcome_status,
  ot.outcome_result
FROM public.claim_letters cl
LEFT JOIN public.quality_metrics qm ON cl.id = qm.document_id
LEFT JOIN public.citation_verifications cv ON cl.id = cv.document_id
LEFT JOIN public.outcome_tracking ot ON cl.id = ot.document_id
ORDER BY cl.created_at DESC
LIMIT 100;

CREATE OR REPLACE VIEW quality_dashboard AS
SELECT 
  qm.id,
  qm.document_id,
  qm.created_at,
  qm.overall_score,
  qm.quality_grade,
  qm.generic_language_score,
  qm.specificity_score,
  qm.professionalism_score,
  qm.structure_score,
  qm.ready_to_send,
  cv.accuracy_rate as citation_accuracy,
  cv.has_hallucinations,
  ot.outcome_result,
  ot.user_satisfaction,
  cl.user_email,
  cl.claim_type,
  cl.phase
FROM public.quality_metrics qm
LEFT JOIN public.citation_verifications cv ON qm.document_id = cv.document_id
LEFT JOIN public.outcome_tracking ot ON qm.document_id = ot.document_id
LEFT JOIN public.claim_letters cl ON qm.document_id = cl.id
ORDER BY qm.created_at DESC;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$ 
BEGIN 
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║  ✅ COMPLETE MIGRATION SUCCESSFUL                          ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📊 BASE SYSTEM:';
  RAISE NOTICE '   ✅ claim_letters table created';
  RAISE NOTICE '   ✅ Storage bucket configured';
  RAISE NOTICE '   ✅ RLS policies enabled';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 QUALITY SYSTEMS:';
  RAISE NOTICE '   ✅ citation_verifications table';
  RAISE NOTICE '   ✅ quality_metrics table';
  RAISE NOTICE '   ✅ outcome_tracking table';
  RAISE NOTICE '   ✅ structured_logs table';
  RAISE NOTICE '   ✅ ab_test_experiments table';
  RAISE NOTICE '   ✅ ab_test_assignments table';
  RAISE NOTICE '   ✅ prompt_versions table';
  RAISE NOTICE '   ✅ quality_benchmarks table';
  RAISE NOTICE '';
  RAISE NOTICE '🔐 ADMIN SYSTEM:';
  RAISE NOTICE '   ✅ admin_users table';
  RAISE NOTICE '   ✅ admin_sessions table';
  RAISE NOTICE '   ✅ admin_activity_log table';
  RAISE NOTICE '';
  RAISE NOTICE '📈 ANALYTICS:';
  RAISE NOTICE '   ✅ admin_dashboard_stats view';
  RAISE NOTICE '   ✅ admin_recent_activity view';
  RAISE NOTICE '   ✅ quality_dashboard view';
  RAISE NOTICE '   ✅ get_success_rate_by_claim_type() function';
  RAISE NOTICE '   ✅ get_quality_statistics() function';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 NEXT STEPS:';
  RAISE NOTICE '   1. Set ADMIN_SETUP_KEY in Netlify environment';
  RAISE NOTICE '   2. Call admin-setup-password function to create admin';
  RAISE NOTICE '   3. Login at: /admin-login.html';
  RAISE NOTICE '   4. Access dashboard at: /admin-dashboard.html';
  RAISE NOTICE '';
  RAISE NOTICE '📚 Documentation: See ADMIN_SETUP_INSTRUCTIONS.md';
  RAISE NOTICE '';
END $$;

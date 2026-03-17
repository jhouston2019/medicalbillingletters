-- ============================================================================
-- ADMIN SYSTEM MIGRATION
-- Secure admin authentication and comprehensive dashboard
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE ADMIN_USERS TABLE
-- ============================================================================

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

-- ============================================================================
-- PART 2: CREATE ADMIN_SESSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES public.admin_users(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamp NOT NULL,
  created_at timestamp DEFAULT now()
);

-- ============================================================================
-- PART 3: CREATE ADMIN_ACTIVITY_LOG TABLE
-- ============================================================================

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

-- ============================================================================
-- PART 4: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_admin_users_email 
ON public.admin_users(email);

CREATE INDEX IF NOT EXISTS idx_admin_users_is_active 
ON public.admin_users(is_active);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token 
ON public.admin_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_user 
ON public.admin_sessions(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires 
ON public.admin_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_activity_admin_user 
ON public.admin_activity_log(admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_activity_created 
ON public.admin_activity_log(created_at);

-- ============================================================================
-- PART 5: ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role full access to admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Service role full access to admin_sessions" ON public.admin_sessions;
DROP POLICY IF EXISTS "Service role full access to admin_activity_log" ON public.admin_activity_log;

-- Only service role can access admin tables (backend functions only)
CREATE POLICY "Service role full access to admin_users" ON public.admin_users
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to admin_sessions" ON public.admin_sessions
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to admin_activity_log" ON public.admin_activity_log
FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ============================================================================
-- PART 6: CREATE UPDATED_AT TRIGGERS
-- ============================================================================

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

-- ============================================================================
-- PART 7: CREATE DEFAULT ADMIN USER
-- ============================================================================
-- Password: Admin2026! (bcrypt hash)
-- IMPORTANT: Change this password immediately after first login!

INSERT INTO public.admin_users (email, password_hash, full_name, role, is_active)
VALUES (
  'admin@insuranceclaimletterhelp.ai',
  '$2b$10$YourBcryptHashHere', -- This will be generated by the backend on first setup
  'System Administrator',
  'super_admin',
  true
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- PART 8: CREATE ADMIN DASHBOARD VIEWS
-- ============================================================================

-- Dashboard statistics view
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  -- User metrics
  (SELECT COUNT(*) FROM auth.users) as total_users,
  (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '7 days') as new_users_7d,
  (SELECT COUNT(*) FROM auth.users WHERE created_at > now() - interval '30 days') as new_users_30d,
  
  -- Document metrics
  (SELECT COUNT(*) FROM public.claim_letters) as total_documents,
  (SELECT COUNT(*) FROM public.claim_letters WHERE created_at > now() - interval '7 days') as new_documents_7d,
  (SELECT COUNT(*) FROM public.claim_letters WHERE letter_generated = true) as letters_generated,
  (SELECT COUNT(*) FROM public.claim_letters WHERE payment_status = 'completed') as paid_documents,
  
  -- Revenue metrics
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed') as total_revenue,
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed' AND created_at > now() - interval '7 days') as revenue_7d,
  (SELECT COUNT(*) * 19 FROM public.claim_letters WHERE payment_status = 'completed' AND created_at > now() - interval '30 days') as revenue_30d,
  
  -- Quality metrics (if quality_metrics table exists)
  (SELECT COALESCE(AVG(overall_score), 0) FROM public.quality_metrics WHERE created_at > now() - interval '7 days') as avg_quality_7d,
  (SELECT COALESCE(AVG(citation_accuracy_rate), 0) FROM public.citation_verifications WHERE created_at > now() - interval '7 days') as avg_citation_accuracy_7d,
  
  -- Outcome metrics (if outcome_tracking table exists)
  (SELECT COUNT(*) FROM public.outcome_tracking WHERE outcome_result = 'success') as successful_outcomes,
  (SELECT COUNT(*) FROM public.outcome_tracking WHERE outcome_result IN ('success', 'partial_success', 'failure', 'settled')) as total_outcomes,
  
  -- System health
  (SELECT COUNT(*) FROM public.structured_logs WHERE log_level = 'error' AND created_at > now() - interval '24 hours') as errors_24h,
  (SELECT COUNT(*) FROM public.structured_logs WHERE log_level = 'critical' AND created_at > now() - interval '24 hours') as critical_errors_24h;

-- Recent activity view
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

-- ============================================================================
-- PART 9: ADD COMMENTS
-- ============================================================================

COMMENT ON TABLE public.admin_users IS 
'Admin users with secure authentication for dashboard access';

COMMENT ON TABLE public.admin_sessions IS 
'Active admin sessions with expiration tracking';

COMMENT ON TABLE public.admin_activity_log IS 
'Audit log of all admin actions for security and compliance';

COMMENT ON VIEW admin_dashboard_stats IS 
'Real-time dashboard statistics for admin overview';

COMMENT ON VIEW admin_recent_activity IS 
'Recent document activity with quality and outcome metrics';

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$ 
BEGIN 
  RAISE NOTICE '✅ ADMIN SYSTEM MIGRATION COMPLETE';
  RAISE NOTICE 'Tables: admin_users, admin_sessions, admin_activity_log created';
  RAISE NOTICE 'Views: admin_dashboard_stats, admin_recent_activity created';
  RAISE NOTICE 'RLS: Enabled (service role only)';
  RAISE NOTICE 'Default Admin: admin@insuranceclaimletterhelp.ai';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT: Set up admin password via backend function';
  RAISE NOTICE '🚀 Admin system ready';
END $$;

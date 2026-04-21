-- Billing entitlements, Stripe idempotency, and per-user review usage
-- Apply after existing auth + claim_letters migrations.

create table if not exists public.processed_sessions (
  session_id text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  completed_at timestamptz,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

create index if not exists idx_processed_sessions_status on public.processed_sessions(status);

create table if not exists public.user_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_customer_id text NOT NULL UNIQUE,
  email text,
  plan_type text NOT NULL DEFAULT 'single',
  paid boolean NOT NULL DEFAULT false,
  renewal_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  review_limit integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

create index if not exists idx_user_entitlements_user_id on public.user_entitlements(user_id);
create index if not exists idx_user_entitlements_email on public.user_entitlements(email);

create table if not exists public.user_review_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

create index if not exists idx_user_review_usage_user_created on public.user_review_usage(user_id, created_at);

alter table public.processed_sessions enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_review_usage enable row level security;

-- No client policies: server functions use service role. (Authenticated users could read own entitlements later.)
create policy "Users read own entitlements" on public.user_entitlements
  for select using (auth.uid() = user_id);

create policy "Users read own review usage" on public.user_review_usage
  for select using (auth.uid() = user_id);

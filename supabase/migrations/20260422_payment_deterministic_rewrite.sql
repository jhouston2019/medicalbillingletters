-- FULL payment/auth rewrite: single source of truth (user_entitlements), transactional verify only.
-- FK user_id references auth.users (Supabase JWT subject).

drop table if exists public.user_review_usage cascade;
drop table if exists public.processed_sessions cascade;
drop table if exists public.user_entitlements cascade;

drop function if exists public.apply_verified_checkout(text, uuid, text, text) cascade;

do $$ begin
  create type public.entitlement_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.processed_session_status as enum ('pending', 'completed');
exception
  when duplicate_object then null;
end $$;

create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  plan_type text not null,
  status public.entitlement_status not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.processed_sessions (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.processed_session_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_processed_sessions_user_id on public.processed_sessions(user_id);

-- analysis_json: required for idempotent replay of analyze-medical-bill (spec: return existing result)
create table public.user_review_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null unique references public.processed_sessions(session_id) on delete restrict,
  analysis_json jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_user_review_usage_user_id on public.user_review_usage(user_id);

alter table public.user_entitlements enable row level security;
alter table public.processed_sessions enable row level security;
alter table public.user_review_usage enable row level security;

create policy "user_entitlements_select_own" on public.user_entitlements
  for select using (auth.uid() = user_id);

create policy "processed_sessions_select_own" on public.processed_sessions
  for select using (auth.uid() = user_id);

create policy "user_review_usage_select_own" on public.user_review_usage
  for select using (auth.uid() = user_id);

-- Transactional entitlement + session completion (service_role / SECURITY DEFINER only)
create or replace function public.apply_verified_checkout(
  p_session_id text,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_plan_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_entitlements (user_id, stripe_customer_id, plan_type, status, created_at, updated_at)
  values (p_user_id, p_stripe_customer_id, p_plan_type, 'active', now(), now())
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    plan_type = excluded.plan_type,
    status = 'active',
    updated_at = now();

  insert into public.processed_sessions (session_id, user_id, status, created_at, updated_at)
  values (p_session_id, p_user_id, 'completed', now(), now())
  on conflict (session_id) do update set
    user_id = excluded.user_id,
    status = 'completed',
    updated_at = now();
end;
$$;

revoke all on function public.apply_verified_checkout(text, uuid, text, text) from public;
grant execute on function public.apply_verified_checkout(text, uuid, text, text) to service_role;

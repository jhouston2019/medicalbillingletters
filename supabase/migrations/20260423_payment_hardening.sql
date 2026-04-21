-- Hardening: entitlement expiry, audit log (payment_events), RPC accepts expires_at.

do $$ begin
  alter table public.user_entitlements add column expires_at timestamptz;
exception
  when duplicate_column then null;
end $$;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_id text,
  event_type text not null,
  stripe_event_id text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_events_user on public.payment_events(user_id);
create index if not exists idx_payment_events_session on public.payment_events(session_id);
create unique index if not exists idx_payment_events_stripe_id_unique
  on public.payment_events(stripe_event_id)
  where stripe_event_id is not null;

alter table public.payment_events enable row level security;

-- Replace entitlement RPC to set expires_at (verify + reconcile only callers)
drop function if exists public.apply_verified_checkout(text, uuid, text, text) cascade;

create or replace function public.apply_verified_checkout(
  p_session_id text,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_plan_type text,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_entitlements (user_id, stripe_customer_id, plan_type, status, expires_at, created_at, updated_at)
  values (p_user_id, p_stripe_customer_id, p_plan_type, 'active', p_expires_at, now(), now())
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    plan_type = excluded.plan_type,
    status = 'active',
    expires_at = excluded.expires_at,
    updated_at = now();

  insert into public.processed_sessions (session_id, user_id, status, created_at, updated_at)
  values (p_session_id, p_user_id, 'completed', now(), now())
  on conflict (session_id) do update set
    user_id = excluded.user_id,
    status = 'completed',
    updated_at = now();
end;
$$;

revoke all on function public.apply_verified_checkout(text, uuid, text, text, timestamptz) from public;
grant execute on function public.apply_verified_checkout(text, uuid, text, text, timestamptz) to service_role;

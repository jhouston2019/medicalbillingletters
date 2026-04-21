-- Final hardening: session locking (processing), grace status, stripe_period_end, DB rate limits, single finalize RPC.

do $$ begin
  alter type public.processed_session_status add value 'processing';
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter table public.user_entitlements add column stripe_period_end timestamptz;
exception
  when duplicate_column then null;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_entitlements'
      and column_name = 'status'
      and udt_name = 'entitlement_status'
  ) then
    alter table public.user_entitlements add column status_migrate text;
    update public.user_entitlements
    set status_migrate = case status::text
      when 'active' then 'active'
      when 'inactive' then 'inactive'
      else 'inactive'
    end;
    alter table public.user_entitlements drop column status;
    alter table public.user_entitlements rename column status_migrate to status;
    alter table public.user_entitlements
      add constraint user_entitlements_status_chk check (status in ('active', 'grace', 'inactive'));
    alter table public.user_entitlements alter column status set default 'active';
    alter table public.user_entitlements alter column status set not null;
    drop type public.entitlement_status;
  end if;
end $$;

do $$ begin
  alter table public.payment_events add column risk_flag boolean not null default false;
exception
  when duplicate_column then null;
end $$;

do $$ begin
  alter table public.payment_events add column risk_reason text;
exception
  when duplicate_column then null;
end $$;

create table if not exists public.api_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hit_count int not null default 0,
  primary key (user_id, action, window_start)
);

alter table public.api_rate_limit_windows enable row level security;

create or replace function public.rate_limit_consume(
  p_user_id uuid,
  p_action text,
  p_max int,
  p_window_sec int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  epoch bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  bucket bigint := (epoch / p_window_sec) * p_window_sec;
  w_start timestamptz := to_timestamp(bucket) at time zone 'utc';
  new_count int;
  rem int;
begin
  insert into public.api_rate_limit_windows (user_id, action, window_start, hit_count)
  values (p_user_id, p_action, w_start, 1)
  on conflict (user_id, action, window_start)
  do update set hit_count = public.api_rate_limit_windows.hit_count + 1
  returning hit_count into new_count;

  if new_count > p_max then
    rem := p_window_sec - (epoch % p_window_sec);
    if rem <= 0 then rem := p_window_sec; end if;
    return jsonb_build_object('allowed', false, 'retry_after_sec', rem, 'count', new_count);
  end if;

  return jsonb_build_object('allowed', true, 'count', new_count);
end;
$$;

revoke all on function public.rate_limit_consume(uuid, text, int, int) from public;
grant execute on function public.rate_limit_consume(uuid, text, int, int) to service_role;

create or replace function public.session_verify_fast_path(p_session_id text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform pg_advisory_xact_lock(hashtext(p_session_id));
  select session_id, user_id, status into r
  from public.processed_sessions
  where session_id = p_session_id
  for update;

  if not found then
    return false;
  end if;
  if r.status = 'completed' and r.user_id = p_user_id then
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.session_verify_fast_path(text, uuid) from public;
grant execute on function public.session_verify_fast_path(text, uuid) to service_role;

drop function if exists public.apply_verified_checkout(text, uuid, text, text, timestamptz) cascade;
drop function if exists public.apply_verified_checkout(text, uuid, text, text) cascade;

create or replace function public.finalize_verified_checkout(
  p_session_id text,
  p_user_id uuid,
  p_stripe_customer_id text,
  p_plan_type text,
  p_expires_at timestamptz,
  p_stripe_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  perform pg_advisory_xact_lock(hashtext(p_session_id));

  select session_id, user_id, status into r
  from public.processed_sessions
  where session_id = p_session_id
  for update;

  if found then
    if r.user_id is distinct from p_user_id then
      return jsonb_build_object('error', 'wrong_user');
    end if;
    if r.status = 'completed' then
      return jsonb_build_object('ok', true, 'already', true);
    end if;
    if r.status = 'processing' then
      return jsonb_build_object('error', 'processing_conflict');
    end if;
    if r.status = 'pending' then
      update public.processed_sessions
      set status = 'processing', user_id = p_user_id, updated_at = now()
      where session_id = p_session_id;
    end if;
  else
    insert into public.processed_sessions (session_id, user_id, status, created_at, updated_at)
    values (p_session_id, p_user_id, 'processing', now(), now());
  end if;

  insert into public.user_entitlements (
    user_id, stripe_customer_id, plan_type, status, expires_at, stripe_period_end, created_at, updated_at
  )
  values (
    p_user_id, p_stripe_customer_id, p_plan_type, 'active',
    p_expires_at, p_stripe_period_end, now(), now()
  )
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    plan_type = excluded.plan_type,
    status = 'active',
    expires_at = excluded.expires_at,
    stripe_period_end = excluded.stripe_period_end,
    updated_at = now();

  update public.processed_sessions
  set status = 'completed', user_id = p_user_id, updated_at = now()
  where session_id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.finalize_verified_checkout(text, uuid, text, text, timestamptz, timestamptz) from public;
grant execute on function public.finalize_verified_checkout(text, uuid, text, text, timestamptz, timestamptz) to service_role;

create table if not exists public.user_usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  usage_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, period_start, period_end)
);

create index if not exists idx_user_usage_periods_user on public.user_usage_periods(user_id);

alter table public.user_usage_periods enable row level security;

begin;

create table public.plugin_scans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  scan_key text not null,
  created_at timestamptz not null default statement_timestamp(),
  finished_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  report jsonb,
  check ((status = 'completed') = (report is not null))
);

create index on public.plugin_scans (owner_id, scan_key, created_at desc);
create index on public.plugin_scans (owner_id, created_at desc);

-- Costs are independent of the account row. Deleting an account must not erase
-- provider charges from the global budget window.
create table public.plugin_spend_reservations (
  scan_id uuid primary key,
  created_at timestamptz not null,
  reserved_microusd integer not null check (reserved_microusd > 0)
);
create index on public.plugin_spend_reservations (created_at);

alter table public.plugin_scans enable row level security;
alter table public.plugin_spend_reservations enable row level security;
revoke all on public.plugin_scans, public.plugin_spend_reservations from public, anon, authenticated;
grant select on public.plugin_scans to authenticated;
grant select, insert, update on public.plugin_scans to service_role;
grant select, insert on public.plugin_spend_reservations to service_role;
create policy own_completed_scans on public.plugin_scans for select to authenticated
  using (owner_id = (select auth.uid()) and status = 'completed');

create function public.plugin_reserve_scan(p_owner uuid, p_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz;
  month_at timestamptz;
  day_at timestamptz;
  reset_at timestamptz;
  prior public.plugin_scans%rowtype;
  used integer;
  day_spend bigint;
  month_spend bigint;
  scan_id uuid;
  response jsonb;
  cost constant integer := 20000; -- Five $0.004 calls. No automatic retries.
begin
  perform pg_catalog.pg_advisory_xact_lock(21927480);
  now_at := clock_timestamp();
  month_at := date_trunc('month', now_at, 'UTC');
  day_at := date_trunc('day', now_at, 'UTC');
  reset_at := (month_at at time zone 'UTC' + interval '1 month') at time zone 'UTC';

  select count(*) into used from public.plugin_scans
  where owner_id = p_owner and created_at >= month_at
    and (status = 'completed' or (status = 'pending' and created_at > now_at - interval '10 minutes'));
  response := jsonb_build_object('remaining', greatest(20 - used, 0), 'resetsAt', reset_at);

  select * into prior from public.plugin_scans
  where owner_id = p_owner and scan_key = p_key and (
    (status = 'completed' and finished_at > now_at - interval '7 days')
    or (status = 'pending' and created_at > now_at - interval '10 minutes')
  ) order by created_at desc limit 1;
  if found then
    return response || jsonb_build_object(
      'state', case when prior.status = 'completed' then 'cached' else 'pending' end,
      'id', prior.id, 'report', prior.report
    );
  end if;

  if used >= 20 then
    return response || jsonb_build_object('state', 'quota');
  end if;

  select coalesce(sum(reserved_microusd) filter (where created_at >= day_at), 0),
         coalesce(sum(reserved_microusd), 0)
    into day_spend, month_spend
    from public.plugin_spend_reservations where created_at >= month_at;
  if month_spend + cost > 50000000 then
    return response || jsonb_build_object('state', 'budget', 'retryAt', reset_at);
  end if;
  if day_spend + cost > 2000000 then
    return response || jsonb_build_object('state', 'budget', 'retryAt', day_at + interval '24 hours');
  end if;

  insert into public.plugin_scans (owner_id, scan_key, created_at)
    values (p_owner, p_key, now_at) returning id into scan_id;
  insert into public.plugin_spend_reservations (scan_id, created_at, reserved_microusd)
    values (scan_id, now_at, cost);
  return response || jsonb_build_object('state', 'reserved', 'id', scan_id, 'remaining', 19 - used);
end;
$$;

create function public.plugin_finish_scan(p_owner uuid, p_id uuid, p_report jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.plugin_scans
  set status = case when p_report is null then 'failed' else 'completed' end,
      report = p_report, finished_at = clock_timestamp()
  where owner_id = p_owner and id = p_id and status = 'pending'
    and created_at > clock_timestamp() - interval '10 minutes';
  return found;
end;
$$;

revoke all on function public.plugin_reserve_scan(uuid, text), public.plugin_finish_scan(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.plugin_reserve_scan(uuid, text), public.plugin_finish_scan(uuid, uuid, jsonb)
  to service_role;

commit;

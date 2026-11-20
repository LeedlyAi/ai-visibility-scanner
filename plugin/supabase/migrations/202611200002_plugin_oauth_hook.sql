begin;

create table public.plugin_oauth_client (
  singleton boolean primary key default true check (singleton),
  client_id text not null,
  resource text not null check (resource like 'https://%/mcp')
);

alter table public.plugin_oauth_client enable row level security;
revoke all on public.plugin_oauth_client from public, anon, authenticated, service_role;
grant select on public.plugin_oauth_client to supabase_auth_admin;
create policy auth_admin_plugin_client on public.plugin_oauth_client
  for select to supabase_auth_admin using (true);

-- This hook applies only to the single registered ChatGPT OAuth client.
-- Normal Supabase sign-in tokens retain their existing audience and claims.
create function public.plugin_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  client public.plugin_oauth_client%rowtype;
begin
  select * into client from public.plugin_oauth_client
  where client_id = event #>> '{claims,client_id}';
  if not found then return event; end if;
  return jsonb_set(
    jsonb_set(event, '{claims,aud}', to_jsonb(client.resource)),
    '{claims,scope}', '"openid"'::jsonb
  );
end;
$$;

revoke all on function public.plugin_access_token_hook(jsonb) from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.plugin_access_token_hook(jsonb) to supabase_auth_admin;

commit;

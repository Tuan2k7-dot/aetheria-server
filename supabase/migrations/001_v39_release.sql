-- CHRONO TOWER V39.0 RC — server-only profile and Raid receipt storage.
-- Apply in Supabase SQL Editor before deploying the V39 server.
-- Do NOT add anon/authenticated write policies: browser writes must go through Render.

create table if not exists public.aetheria_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Adventurer',
  profile_json jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.aetheria_profiles enable row level security;
revoke all on table public.aetheria_profiles from anon, authenticated;
grant all on table public.aetheria_profiles to service_role;

create table if not exists public.aetheria_raid_receipts (
  raid_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  boss_key text not null check (boss_key in ('golgoth','astraea')),
  boss_name text not null,
  success boolean not null default false,
  damage bigint not null default 0 check (damage >= 0),
  loot_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  primary key (raid_id, user_id)
);

alter table public.aetheria_raid_receipts enable row level security;
revoke all on table public.aetheria_raid_receipts from anon, authenticated;
grant all on table public.aetheria_raid_receipts to service_role;
create index if not exists aetheria_raid_receipts_user_created_idx
  on public.aetheria_raid_receipts(user_id, created_at desc);

create or replace function public.aetheria_save_profile_v39(
  p_user_id uuid,
  p_display_name text,
  p_profile_json jsonb,
  p_expected_revision bigint
) returns table(saved boolean, revision bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision bigint;
begin
  insert into public.aetheria_profiles as current_profile
    (user_id, display_name, profile_json, revision, created_at, updated_at)
  values
    (p_user_id, left(coalesce(p_display_name, 'Adventurer'), 24), coalesce(p_profile_json, '{}'::jsonb), 1, now(), now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        profile_json = excluded.profile_json,
        revision = current_profile.revision + 1,
        updated_at = now()
    where current_profile.revision = p_expected_revision
  returning current_profile.revision into v_revision;

  if v_revision is null then
    select current_profile.revision into v_revision
      from public.aetheria_profiles as current_profile where current_profile.user_id = p_user_id;
    return query select false, coalesce(v_revision, 0);
  else
    return query select true, v_revision;
  end if;
end;
$$;

revoke all on function public.aetheria_save_profile_v39(uuid,text,jsonb,bigint) from public, anon, authenticated;
grant execute on function public.aetheria_save_profile_v39(uuid,text,jsonb,bigint) to service_role;

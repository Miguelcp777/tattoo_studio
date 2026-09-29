-- TASK-0054: the monitoring event store, in Supabase Postgres.
--
-- Run once, in Supabase Studio -> SQL Editor, as the database owner. Before running it, replace
-- CHANGE_ME below with a long random password (for example: openssl rand -hex 24). Keep that
-- password out of this file and out of git: it goes only into TATTOO_TELEMETRY_DSN in Coolify.
--
-- The worker's own development store is SQLite with the same columns
-- (services/worker/telemetry/store.py, SQLITE_SCHEMA); both run the same statements.

create schema if not exists inkcraft;

create table if not exists inkcraft.events (
  id            bigint generated always as identity primary key,
  ts            timestamptz not null,
  kind          text not null,
  operation     text not null,
  outcome       text not null,
  account       text,
  job           text,
  provider      text,
  model         text,
  duration_ms   integer,
  input_tokens  integer,
  output_tokens integer,
  images        integer,
  cost_usd      numeric(12, 6),
  text          text,
  detail        text not null default '{}'
);

create index if not exists events_ts on inkcraft.events (ts);
create index if not exists events_account on inkcraft.events (account);

-- A login that can do exactly what the worker needs, on this table only.
do $$
begin
  if not exists (select from pg_roles where rolname = 'inkcraft_worker') then
    create role inkcraft_worker login password 'CHANGE_ME';
  end if;
end
$$;

grant usage on schema inkcraft to inkcraft_worker;
grant select, insert, delete on inkcraft.events to inkcraft_worker;
-- Updating is only ever anonymising an erased account (TEL-INV-004): those two columns, no others.
grant update (account, text) on inkcraft.events to inkcraft_worker;

-- This schema is not published through Supabase's REST API. Row level security is on anyway, so
-- if it ever is, no one but the worker's role can read a row.
alter table inkcraft.events enable row level security;
drop policy if exists inkcraft_worker_only on inkcraft.events;
create policy inkcraft_worker_only on inkcraft.events
  for all to inkcraft_worker using (true) with check (true);

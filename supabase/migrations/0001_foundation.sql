create extension if not exists pgcrypto with schema extensions;

create schema if not exists ledge_private;

revoke all on schema ledge_private from public, anon, authenticated, service_role;
grant usage on schema ledge_private to postgres;

alter default privileges in schema ledge_private
    revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema ledge_private
    revoke execute on functions from public, anon, authenticated, service_role;

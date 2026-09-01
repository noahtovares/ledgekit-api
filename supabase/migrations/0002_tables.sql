create table ledge_private.ledge_apps (
    id uuid primary key default gen_random_uuid(),
    service_name text not null unique check (length(btrim(service_name)) > 0),
    enabled boolean not null default true,
    retention_days integer not null default 30 check (retention_days > 0),
    created_at timestamptz not null default now()
);

create table ledge_private.ledge_ingest_keys (
    id uuid primary key default gen_random_uuid(),
    app_id uuid not null
        references ledge_private.ledge_apps(id) on delete cascade,
    environment text not null
        check (environment in ('development', 'staging', 'production')),
    name text not null check (length(btrim(name)) > 0),
    key_prefix text not null unique
        check (key_prefix ~ '^lk_[A-Za-z0-9_-]{12,16}$'),
    secret_digest bytea not null check (octet_length(secret_digest) = 32),
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    revoked_at timestamptz,
    last_used_at timestamptz
);

create index ledge_ingest_keys_app_idx
    on ledge_private.ledge_ingest_keys (app_id, environment);

create table ledge_private.ledge_traces (
    app_id uuid not null
        references ledge_private.ledge_apps(id) on delete cascade,
    environment text not null
        check (environment in ('development', 'staging', 'production')),
    id uuid not null,
    received_at timestamptz not null default now(),
    trace_name text not null,
    trace_version integer not null check (trace_version > 0),
    status text not null
        check (status in ('success', 'failure', 'cancelled', 'interrupted')),
    started_at timestamptz not null,
    ended_at timestamptz not null,
    envelope jsonb not null,
    primary key (app_id, environment, id)
);

create index ledge_traces_received_at_idx
    on ledge_private.ledge_traces (app_id, environment, received_at desc);

create index ledge_traces_definition_idx
    on ledge_private.ledge_traces (
        app_id,
        environment,
        trace_name,
        trace_version
    );

alter table ledge_private.ledge_apps enable row level security;
alter table ledge_private.ledge_ingest_keys enable row level security;
alter table ledge_private.ledge_traces enable row level security;

revoke all on all tables in schema ledge_private
    from public, anon, authenticated, service_role;

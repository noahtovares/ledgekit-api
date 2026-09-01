drop index ledge_private.ledge_ingest_keys_app_idx;

alter table ledge_private.ledge_ingest_keys
    drop constraint ledge_ingest_keys_key_prefix_check,
    drop column environment,
    add constraint ledge_ingest_keys_key_prefix_check
        check (key_prefix ~ '^lk_(live|test)_[A-Za-z0-9_-]{12,16}$');

create index ledge_ingest_keys_app_idx
    on ledge_private.ledge_ingest_keys (app_id);

drop index ledge_private.ledge_traces_received_at_idx;
drop index ledge_private.ledge_traces_definition_idx;

alter table ledge_private.ledge_traces
    drop constraint ledge_traces_pkey,
    drop column environment,
    add primary key (app_id, id);

create index ledge_traces_received_at_idx
    on ledge_private.ledge_traces (app_id, received_at desc);

create index ledge_traces_definition_idx
    on ledge_private.ledge_traces (app_id, trace_name, trace_version);

create or replace function public.ingest_trace(
    p_key_prefix text,
    p_secret_digest_hex text,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_digest bytea;
    v_key_id uuid;
    v_app_id uuid;
    v_service_name text;
    v_trace_id uuid;
    v_trace_name text;
    v_trace_version integer;
    v_status text;
    v_started_at timestamptz;
    v_ended_at timestamptz;
    v_existing jsonb;
    v_inserted integer;
    v_outcome text;
begin
    if p_key_prefix is null
        or p_secret_digest_hex is null
        or p_secret_digest_hex !~ '^[0-9a-f]{64}$'
    then
        raise sqlstate 'PT401' using message = 'invalid_ingest_key';
    end if;

    v_digest := pg_catalog.decode(p_secret_digest_hex, 'hex');

    select key.id, key.app_id, app.service_name
      into v_key_id, v_app_id, v_service_name
      from ledge_private.ledge_ingest_keys as key
      join ledge_private.ledge_apps as app on app.id = key.app_id
     where key.key_prefix = p_key_prefix
       and key.secret_digest = v_digest
       and key.revoked_at is null
       and (key.expires_at is null or key.expires_at > pg_catalog.now())
       and app.enabled
     limit 1;

    if v_key_id is null then
        raise sqlstate 'PT401' using message = 'invalid_ingest_key';
    end if;

    if pg_catalog.jsonb_typeof(p_payload) <> 'object'
        or p_payload ->> 'schemaVersion' <> '1'
        or p_payload #>> '{producer,serviceName}' is null
        or p_payload #>> '{producer,serviceName}' <> v_service_name
        or p_payload #>> '{traceDefinition,name}' is null
        or p_payload #>> '{trace,name}' is null
        or p_payload #>> '{traceDefinition,name}' <> p_payload #>> '{trace,name}'
        or p_payload #>> '{trace,status}' not in
            ('success', 'failure', 'cancelled', 'interrupted')
        or p_payload #>> '{trace,id}' is null
        or p_payload #>> '{trace,startedAt}' is null
        or p_payload #>> '{trace,endedAt}' is null
    then
        raise sqlstate 'PT400' using message = 'invalid_envelope';
    end if;

    begin
        v_trace_id := (p_payload #>> '{trace,id}')::uuid;
        v_trace_version := (p_payload #>> '{traceDefinition,version}')::integer;
        v_started_at := (p_payload #>> '{trace,startedAt}')::timestamptz;
        v_ended_at := (p_payload #>> '{trace,endedAt}')::timestamptz;
    exception when others then
        raise sqlstate 'PT400' using message = 'invalid_envelope';
    end;

    if v_trace_version < 1 or v_ended_at < v_started_at then
        raise sqlstate 'PT400' using message = 'invalid_envelope';
    end if;

    v_trace_name := p_payload #>> '{traceDefinition,name}';
    v_status := p_payload #>> '{trace,status}';

    insert into ledge_private.ledge_traces (
        app_id,
        id,
        trace_name,
        trace_version,
        status,
        started_at,
        ended_at,
        envelope
    ) values (
        v_app_id,
        v_trace_id,
        v_trace_name,
        v_trace_version,
        v_status,
        v_started_at,
        v_ended_at,
        p_payload
    )
    on conflict (app_id, id) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted = 0 then
        select trace.envelope
          into v_existing
          from ledge_private.ledge_traces as trace
         where trace.app_id = v_app_id
           and trace.id = v_trace_id;

        if v_existing is distinct from p_payload then
            raise sqlstate 'PT409' using message = 'trace_conflict';
        end if;
        v_outcome := 'duplicate';
    else
        v_outcome := 'inserted';
    end if;

    update ledge_private.ledge_ingest_keys
       set last_used_at = pg_catalog.now()
     where id = v_key_id;

    return pg_catalog.jsonb_build_object(
        'outcome', v_outcome,
        'traceId', v_trace_id,
        'appId', v_app_id
    );
end;
$$;

revoke all on function public.ingest_trace(text, text, jsonb)
    from public, anon, authenticated;
grant execute on function public.ingest_trace(text, text, jsonb)
    to service_role;

drop function ledge_private.delete_trace(uuid, text, uuid);

create function ledge_private.delete_trace(
    p_app_id uuid,
    p_trace_id uuid
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
    v_deleted integer;
begin
    delete from ledge_private.ledge_traces
     where app_id = p_app_id and id = p_trace_id;
    get diagnostics v_deleted = row_count;
    return v_deleted = 1;
end;
$$;

revoke execute on function ledge_private.delete_trace(uuid, uuid)
    from public, anon, authenticated, service_role;

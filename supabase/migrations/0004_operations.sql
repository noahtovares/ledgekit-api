create or replace function ledge_private.delete_expired_traces()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    v_deleted bigint;
begin
    delete from ledge_private.ledge_traces as trace
     using ledge_private.ledge_apps as app
     where trace.app_id = app.id
       and trace.received_at
           < pg_catalog.now() - pg_catalog.make_interval(days => app.retention_days);
    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

create or replace function ledge_private.delete_trace(
    p_app_id uuid,
    p_environment text,
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
     where app_id = p_app_id
       and environment = p_environment
       and id = p_trace_id;
    get diagnostics v_deleted = row_count;
    return v_deleted = 1;
end;
$$;

revoke execute on all functions in schema ledge_private
    from public, anon, authenticated, service_role;

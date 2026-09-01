select
    app.service_name,
    app.environment,
    trace.trace_name,
    trace.trace_version,
    trace.status,
    count(*) as runs,
    avg((trace.envelope #>> '{trace,durationMilliseconds}')::bigint) as avg_ms
from ledge_private.ledge_traces as trace
join ledge_private.ledge_apps as app on app.id = trace.app_id
where trace.app_id = :app_id
group by
    app.service_name,
    app.environment,
    trace.trace_name,
    trace.trace_version,
    trace.status
order by trace.trace_name, trace.trace_version, trace.status;

select
    trace.id,
    trace.received_at,
    trace.trace_name,
    trace.trace_version,
    trace.status,
    trace.envelope #>> '{trace,error,type}' as error_type,
    trace.envelope #>> '{trace,error,domain}' as error_domain,
    trace.envelope #>> '{trace,error,code}' as error_code
from ledge_private.ledge_traces as trace
where trace.app_id = :app_id
  and trace.status in ('failure', 'cancelled', 'interrupted')
order by trace.received_at desc
limit 100;

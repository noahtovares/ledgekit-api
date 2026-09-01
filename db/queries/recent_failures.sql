select
    trace.id,
    trace.ingest_key_id,
    ingest_key.name as ingest_key_name,
    ingest_key.key_prefix,
    trace.received_at,
    trace.trace_name,
    trace.trace_version,
    trace.status,
    trace.envelope #>> '{trace,error,type}' as error_type,
    trace.envelope #>> '{trace,error,domain}' as error_domain,
    trace.envelope #>> '{trace,error,code}' as error_code
from ledge_private.ledge_traces as trace
join ledge_private.ledge_ingest_keys as ingest_key
  on ingest_key.app_id = trace.app_id
 and ingest_key.id = trace.ingest_key_id
where trace.app_id = :app_id
  and trace.status in ('failure', 'cancelled', 'interrupted')
order by trace.received_at desc
limit 100;

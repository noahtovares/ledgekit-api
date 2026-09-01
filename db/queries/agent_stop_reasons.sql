select
    trace.envelope #>> '{trace,agentLoop,stopReason}' as stop_reason,
    count(*) as runs
from ledge_private.ledge_traces as trace
where trace.app_id = :app_id
  and trace.envelope #> '{trace,agentLoop}' is not null
group by stop_reason
order by runs desc;

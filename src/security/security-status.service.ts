import {db} from "../database/database.js";
import {sandboxStatus} from "../sandbox/sandbox-manager.service.js";

function number(value:unknown){return Number(value||0)}

export async function securityStatus(){
 const sandbox=await sandboxStatus();
 const counters=db.prepare(`
  SELECT
   COUNT(*) total,
   SUM(CASE WHEN type='security.allowed' THEN 1 ELSE 0 END) allowed,
   SUM(CASE WHEN type='security.rejected' THEN 1 ELSE 0 END) rejected
  FROM events
  WHERE type IN ('security.allowed','security.rejected')
 `).get() as any;

 const recentRejected=db.prepare(`
  SELECT id,type,worker_id,project_id,task_id,level,message,data,created_at
  FROM events
  WHERE type='security.rejected'
  ORDER BY id DESC
  LIMIT 20
 `).all();

 const recentTermination=db.prepare(`
  SELECT id,type,worker_id,project_id,task_id,level,message,data,created_at
  FROM events
  WHERE type IN ('sandbox.task_terminated','sandbox.termination_failed')
  ORDER BY id DESC
  LIMIT 20
 `).all();

 return{
  securityLevel:sandbox.policy.securityLevel,
  isolated:sandbox.health.isolated,
  provider:sandbox.policy.provider,
  warning:sandbox.policy.warning,
  counters:{
   total:number(counters?.total),
   allowed:number(counters?.allowed),
   rejected:number(counters?.rejected)
  },
  activeProcesses:sandbox.processes.length,
  activeSandboxes:sandbox.registry.active.length,
  recentRejected,
  recentTermination
 };
}

export function securityEvents(limit=100){
 const safeLimit=Math.max(1,Math.min(500,Math.floor(limit)||100));
 return db.prepare(`
  SELECT id,type,worker_id,project_id,task_id,level,message,data,created_at
  FROM events
  WHERE type LIKE 'security.%'
     OR type LIKE 'sandbox.%'
  ORDER BY id DESC
  LIMIT ?
 `).all(safeLimit);
}

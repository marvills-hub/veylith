import os from "node:os";
import {db} from "../database/database.js";
import {WORKER_ID,now} from "../config/config.js";
import {event} from "../core/telemetry.js";

export type RuntimeStatus="starting"|"online"|"stopping"|"stopped"|"crashed"|"stale";

export interface RuntimeInstance{
 id:string;
 worker_id:string;
 hostname:string;
 pid:number;
 status:RuntimeStatus;
 started_at:string;
 heartbeat_at:string;
 stopped_at:string|null;
 stop_reason:string|null;
}

export const RUNTIME_ID=`rt_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
const STALE_MS=Math.max(1000,Number(process.env.RUNTIME_STALE_MS||30000));
let heartbeatTimer:NodeJS.Timeout|null=null;
let registered=false;

function ensureSchema(){
 db.exec(`
  CREATE TABLE IF NOT EXISTS runtime_instances(
   id TEXT PRIMARY KEY,
   worker_id TEXT NOT NULL,
   hostname TEXT NOT NULL,
   pid INTEGER NOT NULL,
   status TEXT NOT NULL,
   started_at TEXT NOT NULL,
   heartbeat_at TEXT NOT NULL,
   stopped_at TEXT,
   stop_reason TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runtime_worker ON runtime_instances(worker_id,status);
  CREATE INDEX IF NOT EXISTS idx_runtime_heartbeat ON runtime_instances(status,heartbeat_at);
 `);
}

ensureSchema();

export function runtimeOwner(slot:number){
 return `${WORKER_ID}-${RUNTIME_ID}-slot-${slot}`;
}

export function runtimeOwnerToken(runtimeId:string){
 return `-${runtimeId}-slot-`;
}

export function registerRuntime(){
 if(registered)return RUNTIME_ID;
 const time=now();
 db.prepare(`
  INSERT INTO runtime_instances(
   id,worker_id,hostname,pid,status,started_at,heartbeat_at,stopped_at,stop_reason
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  RUNTIME_ID,
  WORKER_ID,
  os.hostname(),
  process.pid,
  "starting",
  time,
  time,
  null,
  null
 );
 registered=true;
 event("runtime.registered","Runtime instance registered",{
  data:{runtimeId:RUNTIME_ID,workerId:WORKER_ID,pid:process.pid,hostname:os.hostname()}
 });
 return RUNTIME_ID;
}

export function setRuntimeStatus(status:RuntimeStatus,reason:string|null=null){
 if(!registered)return;
 const time=now();
 const terminal=["stopped","crashed","stale"].includes(status);
 db.prepare(`
  UPDATE runtime_instances
  SET status=?,heartbeat_at=?,stopped_at=?,stop_reason=?
  WHERE id=?
 `).run(status,time,terminal?time:null,reason,RUNTIME_ID);
}

export function heartbeatRuntime(){
 if(!registered)return false;
 const result=db.prepare(`
  UPDATE runtime_instances
  SET heartbeat_at=?,status=CASE WHEN status='starting' THEN 'online' ELSE status END
  WHERE id=? AND status IN ('starting','online')
 `).run(now(),RUNTIME_ID);
 return Number(result.changes)===1;
}

export function startRuntimeHeartbeat(intervalMs=5000){
 if(heartbeatTimer)return;
 heartbeatRuntime();
 heartbeatTimer=setInterval(()=>{
  try{heartbeatRuntime()}catch{}
 },intervalMs);
 heartbeatTimer.unref();
}

export function stopRuntimeHeartbeat(){
 if(!heartbeatTimer)return;
 clearInterval(heartbeatTimer);
 heartbeatTimer=null;
}

export function markRuntimeStopping(reason:string){
 stopRuntimeHeartbeat();
 setRuntimeStatus("stopping",reason);
}

export function markRuntimeStopped(reason:string){
 stopRuntimeHeartbeat();
 setRuntimeStatus("stopped",reason);
}

export function markRuntimeCrashed(reason:string){
 stopRuntimeHeartbeat();
 setRuntimeStatus("crashed",reason);
}

export function detectStaleRuntimes(){
 const cutoff=new Date(Date.now()-STALE_MS).toISOString();
 const stale=db.prepare(`
  SELECT * FROM runtime_instances
  WHERE id<>?
  AND worker_id=?
  AND status IN ('starting','online','stopping')
  AND heartbeat_at<=?
 `).all(RUNTIME_ID,WORKER_ID,cutoff) as unknown as RuntimeInstance[];
 const time=now();
 const confirmed:RuntimeInstance[]=[];
 for(const runtime of stale){
  const result=db.prepare(`
   UPDATE runtime_instances
   SET status='stale',stopped_at=?,stop_reason='Runtime heartbeat expired'
   WHERE id=?
   AND status IN ('starting','online','stopping')
   AND heartbeat_at<=?
  `).run(time,runtime.id,cutoff);
  if(Number(result.changes)===1){
   confirmed.push(runtime);
   event("runtime.stale","Runtime heartbeat expired",{
    level:"warn",
    data:{
     runtimeId:runtime.id,
     workerId:runtime.worker_id,
     hostname:runtime.hostname,
     pid:runtime.pid,
     heartbeatAt:runtime.heartbeat_at
    }
   });
  }
 }
 return confirmed;
}

export function markPreviousLocalRuntimesCrashed(){
 return detectStaleRuntimes();
}

export function runtimeInstances(limit=50){
 return db.prepare(`
  SELECT * FROM runtime_instances
  ORDER BY started_at DESC
  LIMIT ?
 `).all(limit) as unknown as RuntimeInstance[];
}

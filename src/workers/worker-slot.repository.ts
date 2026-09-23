import os from "node:os";
import {db} from "../database/database.js";
import {WORKER_ID,now} from "../config/config.js";
import {RUNTIME_ID} from "../runtime/runtime-instance.service.js";
import type {WorkerSlot} from "./worker-slot.types.js";

export function slotId(slot:number){return `${WORKER_ID}-${RUNTIME_ID}-slot-${slot}`}

export function registerSlot(slot:number){
 const id=slotId(slot),time=now();
 db.prepare(`
  INSERT INTO worker_slots(
   id,worker_id,slot,hostname,pid,status,phase,
   job_id,task_id,project_id,started_at,heartbeat_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(id) DO UPDATE SET
   hostname=excluded.hostname,
   pid=excluded.pid,
   status='idle',
   phase='waiting',
   job_id=NULL,
   task_id=NULL,
   project_id=NULL,
   heartbeat_at=excluded.heartbeat_at
 `).run(
  id,WORKER_ID,slot,os.hostname(),process.pid,
  "idle","waiting",null,null,null,time,time
 );
 return id;
}

export function setSlot(slot:number,status:string,phase:string,jobId:string|null=null,taskId:string|null=null,projectId:string|null=null){
 const id=slotId(slot),time=now();
 db.prepare(`
  UPDATE worker_slots
  SET status=?,phase=?,job_id=?,task_id=?,project_id=?,heartbeat_at=?
  WHERE id=?
 `).run(status,phase,jobId,taskId,projectId,time,id);
}

export function heartbeatSlot(slot:number){
 db.prepare(`
  UPDATE worker_slots
  SET heartbeat_at=?
  WHERE id=?
 `).run(now(),slotId(slot));
}

export function releaseSlot(slot:number){
 setSlot(slot,"idle","waiting");
}

export function listSlots(){
 return db.prepare(`
  SELECT * FROM worker_slots
  ORDER BY worker_id ASC,slot ASC,started_at ASC
 `).all() as unknown as WorkerSlot[];
}

export function currentRuntimeSlots(){
 return db.prepare(`
  SELECT * FROM worker_slots
  WHERE id LIKE ?
  ORDER BY slot ASC
 `).all(`${WORKER_ID}-${RUNTIME_ID}-slot-%`) as unknown as WorkerSlot[];
}

export function clearRuntimeSlots(runtimeId=RUNTIME_ID){
 const token=`-${runtimeId}-slot-`;
 return Number(db.prepare(`
  DELETE FROM worker_slots
  WHERE worker_id=?
  AND instr(id,?)>0
 `).run(WORKER_ID,token).changes);
}

export function clearLocalSlots(){
 return clearRuntimeSlots();
}

export function clearStaleRuntimeSlots(runtimeIds:string[]){
 let removed=0;
 for(const runtimeId of new Set(runtimeIds)){
  removed+=clearRuntimeSlots(runtimeId);
 }
 return removed;
}

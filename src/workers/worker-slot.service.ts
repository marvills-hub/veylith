import {JOB_CONCURRENCY} from "../config/config.js";
import {event,broadcast} from "../core/telemetry.js";
import {
 registerSlot,
 setSlot,
 heartbeatSlot,
 releaseSlot,
 listSlots,
 currentRuntimeSlots
} from "./worker-slot.repository.js";

export function initializeWorkerSlots(){
 for(let slot=1;slot<=JOB_CONCURRENCY;slot++)registerSlot(slot);
 event("worker.pool.ready",`Worker pool ready with ${JOB_CONCURRENCY} execution slots`,{
  data:{concurrency:JOB_CONCURRENCY}
 });
 broadcast("worker_slots",listSlots());
}

export function occupyWorkerSlot(slot:number,job:any){
 setSlot(slot,"busy","executing",job.id,job.task_id,job.project_id);
 broadcast("worker_slots",listSlots());
}

export function updateWorkerSlotPhase(slot:number,phase:string){
 const current=currentRuntimeSlots().find(item=>item.slot===slot);
 if(!current)return;
 setSlot(slot,"busy",phase,current.job_id,current.task_id,current.project_id);
 broadcast("worker_slots",listSlots());
}

export function pulseWorkerSlot(slot:number){
 heartbeatSlot(slot);
}

export function freeWorkerSlot(slot:number){
 releaseSlot(slot);
 broadcast("worker_slots",listSlots());
}

import {JOB_CONCURRENCY} from "../config/config.js";
import {event} from "../core/telemetry.js";
import {runJobSlot,activeJobCount,activeJobSlots} from "../jobs/job-runner.service.js";

let dispatching=false;

export async function dispatchWorkerPool(){
 if(dispatching)return;
 dispatching=true;
 try{
  const active=new Set(activeJobSlots());
  for(let slot=1;slot<=JOB_CONCURRENCY;slot++){
   if(active.has(slot))continue;
   void runJobSlot(slot).catch(error=>{
    event("worker.slot.error",error instanceof Error?error.message:String(error),{level:"error",data:{slot}});
   });
  }
 }finally{
  dispatching=false;
 }
}

export function workerPoolStatus(){
 const active=activeJobCount();
 return{concurrency:JOB_CONCURRENCY,active,available:Math.max(0,JOB_CONCURRENCY-active),slots:activeJobSlots()};
}

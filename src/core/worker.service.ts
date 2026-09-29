import {dispatchWorkerPool} from "../workers/worker-pool.service.js";
import {runGlobalRoleScheduler} from "../team/global-role-scheduler.service.js";

let scheduling=false;

export async function workerLoop(){
 if(!scheduling){
  scheduling=true;
  try{
   runGlobalRoleScheduler();
  }finally{
   scheduling=false;
  }
 }
 return dispatchWorkerPool();
}

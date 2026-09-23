import {db} from "../database/database.js";
import {
 AI_RECOVERY_INTERVAL_MS,
 now
} from "../config/config.js";
import {event,setWorker} from "./telemetry.js";
import {
 aiProviderHealth,
 getAIProvider
} from "../agent/provider.service.js";
import {
 providerCircuitStatus
} from "./provider-circuit.service.js";
import {resumeTask} from "./task.service.js";
import {recoverJobs} from "../jobs/job-recovery.service.js";
import {enqueueTask} from "../jobs/job.service.js";

let checking=false;
let lastCheck=0;

export function recoverInterruptedTasks(){
 const result=recoverJobs();
 setWorker("online","idle");
 return result.local+result.expired+result.reconciled;
}

export async function resumePausedAIJobs(){
 if(checking)return;

 const time=Date.now();

 if(time-lastCheck<AI_RECOVERY_INTERVAL_MS)return;

 const paused=db.prepare(
  "SELECT * FROM tasks WHERE status='paused' AND phase='waiting_ai' ORDER BY updated_at ASC"
 ).all() as any[];

 if(!paused.length)return;

 const provider=getAIProvider();
 const before=providerCircuitStatus(provider.name);

 if(
  before.state==="open"&&
  before.retryAt!==null&&
  time<before.retryAt
 ){
  lastCheck=time;

  event(
   "ai.recovery.cooldown",
   "AI recovery skipped while provider circuit is cooling down",
   {
    data:{
     provider:provider.name,
     paused:paused.length,
     retryAt:new Date(before.retryAt).toISOString(),
     remainingMs:before.retryAt-time
    }
   }
  );

  return;
 }

 checking=true;
 lastCheck=time;

 try{
  event(
   "ai.recovery.probe",
   `Probing AI provider before resuming ${paused.length} paused task${paused.length===1?"":"s"}`,
   {
    data:{
     provider:provider.name,
     state:providerCircuitStatus(provider.name).state,
     paused:paused.length
    }
   }
  );

  const health=await aiProviderHealth();
  const after=providerCircuitStatus(provider.name);

  if(!health.configured||after.state==="open"){
   event(
    "ai.recovery.wait",
    "AI provider recovery probe failed",
    {
     level:"warn",
     data:{
      provider:provider.name,
      model:health.model,
      state:after.state,
      failures:after.consecutiveFailures,
      retryAt:after.retryAt
       ?new Date(after.retryAt).toISOString()
       :null
     }
    }
   );

   return;
  }

  let resumed=0;

  for(const task of paused){
   try{
    resumeTask(
     task.id,
     "ai_provider_circuit_recovered"
    );
    resumed++;
   }catch(error){
    event(
     "ai.recovery.task_error",
     error instanceof Error
      ?error.message
      :String(error),
     {
      taskId:task.id,
      projectId:task.project_id,
      level:"warn"
     }
    );
   }
  }

  event(
   "ai.recovery.ready",
   `AI provider recovered; ${resumed} task${resumed===1?"":"s"} requeued`,
   {
    data:{
     provider:provider.name,
     model:health.model,
     state:providerCircuitStatus(provider.name).state,
     count:resumed
    }
   }
  );
 }catch(error){
  event(
   "ai.recovery.error",
   error instanceof Error
    ?error.message
    :String(error),
   {level:"warn"}
  );
 }finally{
  checking=false;
 }
}



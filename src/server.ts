import "dotenv/config";
import {createApp} from "./api/routes.js";
import {db} from "./database/database.js";
import {workerLoop} from "./core/worker.service.js";
import {recoverInterruptedTasks,resumePausedAIJobs} from "./core/recovery.service.js";
import {collectMetrics} from "./monitoring/metrics.service.js";
import {event,setWorker} from "./core/telemetry.js";
import {
 VERSION,
 PORT,
 POLL,
 METRIC_INTERVAL,
 WORKER_ID,
 GITHUB_ENABLED,
 GITHUB_OWNER,
 ROOT,
 DB_PATH
} from "./config/config.js";
import {aiProviderStatus} from "./agent/provider.service.js";
import {initializeWorkerSlots} from "./workers/worker-slot.service.js";
import {
 registerRuntime,
 startRuntimeHeartbeat,
 setRuntimeStatus,
 markRuntimeStopping,
 markRuntimeStopped,
 RUNTIME_ID
} from "./runtime/runtime-instance.service.js";
import {releaseRuntimeJobs} from "./jobs/job-recovery.service.js";
import {cancelAllSandboxes} from "./sandbox/sandbox-manager.service.js";
import {logger} from "./logging/logger.service.js";
import {cleanupLogs,logStorageStatus} from "./logging/log-storage.service.js";
import {recoverV1AutonomousStartup} from "./orchestration/v1/lifecycle/lifecycle-startup.service.js";

registerRuntime();
recoverInterruptedTasks();
initializeWorkerSlots();
await recoverV1AutonomousStartup();
startRuntimeHeartbeat();

try{cleanupLogs()}catch{}

const app=createApp();
const ai=aiProviderStatus();

setWorker("online","booting");

event(
 "system.started",
 `Veylith Core v${VERSION} started`,
 {
  component:"system",
  data:{
   pid:process.pid,
   runtimeId:RUNTIME_ID,
   worker:WORKER_ID,
   aiConfigured:ai.configured,
   aiProvider:ai.provider,
   aiModel:ai.model,
   githubConfigured:GITHUB_ENABLED,
   logging:logStorageStatus()
  }
 }
);

const server=app.listen(PORT,()=>{
 logger.info(
  `Veylith Core v${VERSION} listening on port ${PORT}`,
  {
   component:"system",
   operation:"listen"
  },
  {
   port:PORT,
   worker:WORKER_ID,
   runtimeId:RUNTIME_ID,
   aiProvider:ai.provider,
   aiModel:ai.model,
   aiConfigured:ai.configured,
   githubConfigured:GITHUB_ENABLED,
   githubOwner:GITHUB_OWNER||null,
   workspace:ROOT,
   database:DB_PATH
  }
 );

 setWorker("online","idle");
 void startBackgroundServices();
});

let workerRunning=false;
let metricsRunning=false;
let recoveryRunning=false;

async function runWorker(){
 if(workerRunning)return;
 workerRunning=true;

 try{
  await workerLoop();
 }catch(error){
  logger.error(
   "Worker loop failed",
   {component:"worker",operation:"loop"},
   undefined,
   error
  );

  event(
   "worker.error",
   error instanceof Error?error.message:String(error),
   {
    component:"worker",
    level:"error"
   }
  );
 }finally{
  workerRunning=false;
 }
}

async function runMetrics(){
 if(metricsRunning)return;
 metricsRunning=true;

 try{
  await collectMetrics();
 }catch(error){
  event(
   "metrics.error",
   error instanceof Error?error.message:String(error),
   {
    component:"metrics",
    level:"warn"
   }
  );
 }finally{
  metricsRunning=false;
 }
}

async function runRecovery(){
 if(recoveryRunning)return;
 recoveryRunning=true;

 try{
  await resumePausedAIJobs();
 }catch(error){
  logger.error(
   "Background recovery failed",
   {component:"recovery",operation:"resume"},
   undefined,
   error
  );

  event(
   "recovery.error",
   error instanceof Error?error.message:String(error),
   {
    component:"recovery",
    level:"warn"
   }
  );
 }finally{
  recoveryRunning=false;
 }
}

async function startBackgroundServices(){
 void runMetrics();
 void runWorker();
 void runRecovery();

 setInterval(()=>{
  void runWorker();
 },POLL);

 setInterval(()=>{
  void runMetrics();
 },METRIC_INTERVAL);

 setInterval(()=>{
  void runRecovery();
 },5000);
}

let shuttingDown=false;

type ShutdownMode="graceful"|"fatal";

async function shutdown(
 reason:string,
 mode:ShutdownMode="graceful",
 fatalError?:unknown
){
 if(shuttingDown)return;
 shuttingDown=true;

 const crashed=mode==="fatal";

 if(crashed){
  const message=
   fatalError instanceof Error
    ?fatalError.stack||fatalError.message
    :String(fatalError||reason);

  logger.fatal(
   `Veylith fatal shutdown: ${reason}`,
   {
    component:"system",
    operation:"shutdown"
   },
   {reason,runtimeId:RUNTIME_ID},
   fatalError
  );

  try{
   event(
    "system.fatal",
    message,
    {
     component:"system",
     level:"fatal",
     data:{
      kind:reason,
      runtimeId:RUNTIME_ID
     }
    }
   );
  }catch{}

  try{
   setRuntimeStatus(
    "crashed",
    `${reason}: ${message.slice(0,1000)}`
   );
  }catch{}
 }else{
  logger.info(
   `Veylith shutting down (${reason})`,
   {
    component:"system",
    operation:"shutdown"
   }
  );

  try{markRuntimeStopping(reason)}catch{}

  try{
   event(
    "system.stopping",
    `Veylith received ${reason}`,
    {
     component:"system",
     data:{runtimeId:RUNTIME_ID}
    }
   );
  }catch{}
 }

 try{
  try{
   await cancelAllSandboxes("shutdown");
  }catch(error){
   logger.error(
    "Sandbox cleanup failed during shutdown",
    {
     component:"system",
     operation:"sandbox-cleanup"
    },
    {reason},
    error
   );
  }

  try{
   releaseRuntimeJobs(
    RUNTIME_ID,
    crashed
     ?`Runtime crashed: ${reason}`
     :`Graceful shutdown: ${reason}`
   );
  }catch(error){
   logger.error(
    "Job release failed during shutdown",
    {
     component:"system",
     operation:"job-release"
    },
    {reason},
    error
   );
  }

  if(!crashed){
   try{markRuntimeStopped(reason)}catch{}

   try{
    event(
     "system.stopped",
     `Veylith stopped after ${reason}`,
     {
      component:"system",
      data:{runtimeId:RUNTIME_ID}
     }
    );
   }catch{}
  }
 }finally{
  const exitCode=crashed?1:0;

  const forceTimer=setTimeout(()=>{
   try{db.close()}catch{}
   process.exit(exitCode||1);
  },5000);

  forceTimer.unref();

  server.close(()=>{
   clearTimeout(forceTimer);
   try{db.close()}catch{}
   process.exit(exitCode);
  });
 }
}

function fatal(kind:string,error:unknown){
 void shutdown(kind,"fatal",error);
}

process.on("SIGINT",()=>{
 void shutdown("SIGINT");
});

process.on("SIGTERM",()=>{
 void shutdown("SIGTERM");
});

process.on("uncaughtException",error=>{
 fatal("uncaughtException",error);
});

process.on("unhandledRejection",error=>{
 fatal("unhandledRejection",error);
});




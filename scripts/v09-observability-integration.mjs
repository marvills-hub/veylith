import fs from "node:fs";
import {createApp} from "../dist/api/routes.js";
import {logger} from "../dist/logging/logger.service.js";
import {queryLogs} from "../dist/logging/log-query.service.js";
import {logStorageStatus} from "../dist/logging/log-storage.service.js";

let passed=0;
let failed=0;

function check(name,value,detail=""){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}${detail?` - ${detail}`:""}`);
 }
}

const routes=fs.readFileSync(
 "src/api/routes.ts",
 "utf8"
);

const server=fs.readFileSync(
 "src/server.ts",
 "utf8"
);

const runner=fs.readFileSync(
 "scripts/v08-full-regression.mjs",
 "utf8"
);

const jobRunner=fs.readFileSync(
 "src/jobs/job-runner.service.ts",
 "utf8"
);

const metrics=fs.readFileSync(
 "src/monitoring/metrics.service.ts",
 "utf8"
);

check(
 "HTTP request middleware installed",
 routes.includes("requestLogging")&&
 routes.includes("app.use(requestLogging)")
);

check(
 "log query API available",
 routes.includes('"/api/logs"')
);

check(
 "log statistics API available",
 routes.includes('"/api/logs/stats"')
);

check(
 "log files API available",
 routes.includes('"/api/logs/files"')
);

check(
 "job events carry jobId",
 jobRunner.includes("jobId:job.id")
);

check(
 "job logs carry runtime ID",
 jobRunner.includes("runtimeId:RUNTIME_ID")
);

check(
 "job execution duration recorded",
 jobRunner.includes("durationMs:Date.now()-started")
);

check(
 "metrics use structured logger",
 metrics.includes("logger.error")&&
 metrics.includes("logger.debug")
);

check(
 "fatal shutdown mode exists",
 server.includes('type ShutdownMode="graceful"|"fatal"')
);

check(
 "fatal path preserves crashed state",
 server.includes('setRuntimeStatus(')&&
 server.includes('"crashed"')&&
 server.includes("if(!crashed){")
);

check(
 "fatal exit is non-zero",
 server.includes("const exitCode=crashed?1:0")
);

check(
 "fatal errors use structured logger",
 server.includes("logger.fatal")
);

check(
 "raw server console removed",
 !server.includes("console.log")&&
 !server.includes("console.error")&&
 !server.includes("console.warn")
);

check(
 "regression runner shell disabled",
 runner.includes("shell:false")
);

check(
 "deprecated shell true removed",
 !runner.includes('shell:process.platform==="win32"')
);

const marker=`integration_${crypto.randomUUID().replaceAll("-","").slice(0,10)}`;

logger.info(
 `Batch 2 integration ${marker}`,
 {
  component:"integration-test",
  operation:"correlation",
  jobId:`job_${marker}`,
  taskId:`task_${marker}`,
  projectId:`project_${marker}`
 },
 {marker}
);

const logs=queryLogs({
 search:marker,
 limit:10
});

check(
 "correlated integration log query works",
 logs.length===1&&
 logs[0].jobId===`job_${marker}`&&
 logs[0].taskId===`task_${marker}`&&
 logs[0].projectId===`project_${marker}`
);

const storage=logStorageStatus();

check(
 "persistent log storage healthy",
 storage.files>0&&storage.bytes>0
);

const app=createApp();

const httpServer=app.listen(0);

await new Promise(resolve=>
 httpServer.once("listening",resolve)
);

const address=httpServer.address();

if(address&&typeof address==="object"){
 const response=await fetch(
  `http://127.0.0.1:${address.port}/api/health`
 );

 const requestId=response.headers.get(
  "x-request-id"
 );

 await response.json();

 check(
  "HTTP request ID returned",
  Boolean(requestId)
 );

 await new Promise(resolve=>setTimeout(resolve,50));

 const httpLogs=queryLogs({
  component:"http",
  limit:20
 });

 check(
  "HTTP request persisted",
  httpLogs.some(
   item=>
    item.data&&
    typeof item.data==="object"&&
    item.data.path==="/api/health"&&
    item.data.statusCode===200
  )
 );
}else{
 check(
  "HTTP request ID returned",
  false,
  "test server did not expose address"
 );

 check(
  "HTTP request persisted",
  false,
  "test server did not expose address"
 );
}

await new Promise(resolve=>
 httpServer.close(resolve)
);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v0.9 BATCH 2 INTEGRATION REGRESSION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("");
 console.log("VEYLITH v0.9 BATCH 2 INTEGRATION TEST FAILED");
 process.exitCode=1;
}else{
 console.log("");
 console.log("VEYLITH v0.9 BATCH 2 INTEGRATION TEST PASSED");
}

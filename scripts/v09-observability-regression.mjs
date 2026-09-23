import fs from "node:fs";
import path from "node:path";
import {logger} from "../dist/logging/logger.service.js";
import {queryLogs,logStats} from "../dist/logging/log-query.service.js";
import {logFiles,logStorageStatus} from "../dist/logging/log-storage.service.js";
import {redact} from "../dist/logging/log-redaction.service.js";

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

const marker=`obs_${crypto.randomUUID().replaceAll("-","").slice(0,12)}`;
const taskId=`task_${marker}`;
const projectId=`project_${marker}`;
const jobId=`job_${marker}`;

logger.info(
 `Observability regression ${marker}`,
 {
  component:"regression",
  operation:"observability",
  taskId,
  projectId,
  jobId
 },
 {
  marker,
  password:"super-secret-password",
  nested:{
   GITHUB_TOKEN:"ghp_this_must_never_appear"
  }
 }
);

logger.warn(
 `Observability warning ${marker}`,
 {
  component:"regression",
  taskId,
  projectId,
  jobId
 },
 {marker}
);

logger.error(
 `Observability error ${marker}`,
 {
  component:"regression",
  taskId,
  projectId,
  jobId
 },
 {marker},
 new Error("Regression diagnostic error")
);

const records=queryLogs({search:marker,limit:20});

check("structured logs persisted",records.length>=3);
check(
 "task correlation preserved",
 records.every(record=>record.taskId===taskId)
);
check(
 "project correlation preserved",
 records.every(record=>record.projectId===projectId)
);
check(
 "job correlation preserved",
 records.every(record=>record.jobId===jobId)
);
check(
 "component correlation preserved",
 records.every(record=>record.component==="regression")
);
check(
 "log levels preserved",
 ["info","warn","error"].every(level=>records.some(record=>record.level===level))
);
check(
 "error details preserved",
 records.some(record=>record.error?.message==="Regression diagnostic error")
);

const serialized=JSON.stringify(records);

check(
 "password redacted",
 !serialized.includes("super-secret-password")
);
check(
 "GitHub token redacted",
 !serialized.includes("ghp_this_must_never_appear")
);
check(
 "redaction marker present",
 serialized.includes("[REDACTED]")
);

const direct=JSON.stringify(redact({
 password:"abc",
 authorization:"Bearer dangerous-token",
 OPENAI_API_KEY:"sk-thisshouldnotappear"
}));

check("direct secret redaction",!direct.includes("dangerous-token")&&!direct.includes("thisshouldnotappear"));

const files=logFiles();
check("JSONL log file created",files.length>0);
check(
 "JSONL log file exists",
 files.length>0&&fs.existsSync(files[0].path)
);

const storage=logStorageStatus();
check("log storage status available",storage.files>0&&storage.bytes>0);

const stats=logStats();
check("log statistics available",stats.sampled>=3);

console.log("");
console.log("============================================================");
console.log(" VEYLITH v0.9 BATCH 2 OBSERVABILITY REGRESSION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("");
 console.log("VEYLITH v0.9 BATCH 2 OBSERVABILITY TEST FAILED");
 process.exitCode=1;
}else{
 console.log("");
 console.log("VEYLITH v0.9 BATCH 2 OBSERVABILITY TEST PASSED");
}

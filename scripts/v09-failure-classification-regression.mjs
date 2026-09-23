import {classifyJobFailure} from "../dist/jobs/job-failure-classifier.service.js";
import {AIProviderError} from "../dist/core/ai-error.service.js";
import {TaskControlError} from "../dist/core/task-control.service.js";

let passed=0;
let failed=0;

function check(name,condition){
 if(condition){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.log(`FAIL ${name}`);
 }
}

const cancel=classifyJobFailure(
 new TaskControlError("cancel","cancelled")
);
check(
 "cancel is control failure",
 cancel.kind==="control_cancel"
);
check(
 "cancel consumes no attempt",
 !cancel.consumeAttempt
);
check(
 "cancel is terminal control state",
 cancel.cancel&&cancel.terminal
);

const pause=classifyJobFailure(
 new TaskControlError("pause","paused")
);
check(
 "pause is control failure",
 pause.kind==="control_pause"
);
check(
 "pause consumes no attempt",
 !pause.consumeAttempt
);
check(
 "pause remains resumable",
 pause.pause&&!pause.terminal
);

const retryAI=classifyJobFailure(
 new AIProviderError("provider timeout",{
  provider:"test",
  status:503,
  retryable:true
 })
);
check(
 "retryable provider classified",
 retryAI.kind==="provider_retryable"
);
check(
 "retryable provider consumes no attempt",
 !retryAI.consumeAttempt
);
check(
 "retryable provider pauses",
 retryAI.pause&&!retryAI.terminal
);

const permanentAI=classifyJobFailure(
 new AIProviderError("invalid key",{
  provider:"test",
  status:401,
  code:"invalid_api_key",
  retryable:false
 })
);
check(
 "permanent provider classified",
 permanentAI.kind==="provider_permanent"
);
check(
 "permanent provider consumes no execution attempt",
 !permanentAI.consumeAttempt
);
check(
 "permanent provider is terminal",
 permanentAI.terminal
);

const execution=classifyJobFailure(
 new Error("validation execution failed")
);
check(
 "ordinary execution failure classified",
 execution.kind==="execution_retryable"
);
check(
 "ordinary execution failure consumes attempt",
 execution.consumeAttempt
);
check(
 "ordinary execution failure retries",
 execution.retryable&&!execution.terminal
);

const stateCancel=classifyJobFailure(
 new Error("process stopped"),
 {status:"cancelled"}
);
check(
 "cancelled task state overrides generic error",
 stateCancel.kind==="control_cancel"&&!stateCancel.consumeAttempt
);

const statePause=classifyJobFailure(
 new Error("process stopped"),
 {status:"paused"}
);
check(
 "paused task state overrides generic error",
 statePause.kind==="control_pause"&&!statePause.consumeAttempt
);

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 3 FAILURE CLASSIFICATION");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed){
 console.log("\nVEYLITH v0.9 BATCH 3 PASS 2 FAILED");
 process.exitCode=1;
}else{
 console.log("\nVEYLITH v0.9 BATCH 3 PASS 2 CLASSIFIER PASSED");
}




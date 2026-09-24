import {readFileSync} from "node:fs";

let passed=0;
let failed=0;

function check(name:string,value:boolean){
 if(value){
  passed++;
  console.log(`PASS ${name}`);
 }else{
  failed++;
  console.error(`FAIL ${name}`);
 }
}

const recovery=readFileSync("src/team/team-recovery.service.ts","utf8");
const scope=readFileSync("src/intelligence/repair-scope.service.ts","utf8");
const diagnostic=readFileSync("src/agent/diagnostic.service.ts","utf8");

check(
 "team recovery history helper uses project identity",
 recovery.includes("function repairHistoryForProject(projectId:string)")
);

check(
 "team recovery calls repair history with project id",
 recovery.includes("repairHistoryForProject(input.projectId)")
);

check(
 "obsolete task-id repair history call removed",
 !recovery.includes("repairHistoryForTask(input.task.id)")
);

check(
 "diagnostic repair history is project scoped",
 diagnostic.includes("WHERE project_id=?")
);

check(
 "focused repair requires diagnosed root cause participation",
 scope.includes("Focused repair did not modify a diagnosed root-cause file")
);

check(
 "root cause guard checks diagnosed files",
 scope.includes('scope.diagnosedFiles.some(target=>related(changed,target))')
);

check(
 "planned files remain valid repair authority",
 scope.includes("...plannedFiles")
);

check(
 "centralized allowed files retained",
 scope.includes("allowedFiles")
);

check(
 "repair file-count safety retained",
 scope.includes("changedFiles.length>scope.maxChangedFiles")
);

check(
 "team recovery uses durable recovery attempt authority",
 recovery.includes("attempt<recovery.maxAttempts")
);

console.log(`\n7.4F regression: ${passed}/${passed+failed}`);
process.exitCode=failed?1:0;


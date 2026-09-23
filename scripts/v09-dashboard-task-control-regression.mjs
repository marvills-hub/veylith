import fs from "node:fs";

const checks=[];

function check(name,value){
 checks.push([name,Boolean(value)]);
}

const index=fs.readFileSync("public/index.html","utf8");
const app=fs.readFileSync("public/js/app.js","utf8");
const activity=fs.readFileSync("public/js/components/activity.js","utf8");
const control=fs.readFileSync("public/js/components/task-control.js","utf8");
const api=fs.readFileSync("public/js/api/client.js","utf8");
const css=fs.readFileSync("public/css/app.css","utf8");

check("task rows are selectable",activity.includes("data-task")&&activity.includes("onSelect"));
check("selected task stored in dashboard state",activity.includes("selectedTaskId"));
check("task control module exists",control.includes("setupTaskControl"));
check("task lookup implemented",control.includes("findTask"));
check("job lookup implemented",control.includes("findJob"));
check("worker lookup implemented",control.includes("findWorker"));
check("phase display implemented",control.includes("controlPhase"));
check("worker assignment display implemented",control.includes("controlWorker"));
check("job display implemented",control.includes("controlJob"));
check("attempt monitoring implemented",control.includes("controlAttempts"));
check("repair monitoring implemented",control.includes("controlRepairs"));
check("progress monitoring implemented",control.includes("controlProgressBar"));
check("task errors exposed",control.includes("controlError"));
check("pause control wired",control.includes("api.pauseTask"));
check("resume control wired",control.includes("api.resumeTask"));
check("cancel control wired",control.includes("api.cancelTask"));
check("priority control wired",control.includes("api.priority"));
check("terminal tasks disable controls",control.includes('"completed","failed","cancelled"'));
check("cancel requires confirmation",control.includes("confirm("));
check("control refresh after action",control.includes("refreshCallback"));
check("application integrates task control",app.includes("setupTaskControl"));
check("live refresh updates selected task",app.includes("renderTaskControl"));
check("task control overlay exists",index.includes('id="taskControl"'));
check("execution control buttons exist",index.includes('id="pauseTask"')&&index.includes('id="resumeTask"')&&index.includes('id="cancelTask"'));
check("priority input exists",index.includes('id="controlPriority"'));
check("control panel styling exists",css.includes(".control-panel"));
check("selected task styling exists",css.includes(".task-row.selected"));
check("API pause endpoint retained",api.includes("/pause"));
check("API resume endpoint retained",api.includes("/resume"));
check("API cancel endpoint retained",api.includes("/cancel"));

console.log("\n============================================================");
console.log(" VEYLITH v0.9 BATCH 5 PASS 2 TASK CONTROL");
console.log("============================================================");

let passed=0;

for(const [name,ok] of checks){
 console.log(`${ok?"PASS":"FAIL"} ${name}`);
 if(ok)passed++;
}

console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${checks.length-passed}`);
console.log(`Total:  ${checks.length}`);

process.exitCode=passed===checks.length?0:1;

import assert from"node:assert/strict";
import fs from"node:fs";
import path from"node:path";

let passed=0;
let failed=0;

async function check(name,fn){
 try{
  await fn();
  passed++;
  console.log(`PASS ${name}`);
 }catch(error){
  failed++;
  console.error(`FAIL ${name}`);
  console.error(error);
 }
}

function source(file){
 return fs.readFileSync(
  path.join(process.cwd(),file),
  "utf8"
 );
}

await check("goal role executor consumes evolution-aware context",async()=>{
 const text=source("src/team/goal-role-executor.service.ts");
 assert.match(text,/buildAgentProjectContext/);
 assert.match(text,/VEYLITH AUTONOMOUS PROJECT CONTEXT/);
});

await check("goal role executor synchronizes successful repository work",async()=>{
 const text=source("src/team/goal-role-executor.service.ts");
 assert.match(text,/synchronizeRepositoryLearning/);
});

await check("team recovery captures repair evolution",async()=>{
 const text=source("src/team/team-recovery.service.ts");
 assert.match(text,/synchronizeRepairEvolution/);
});

await check("team recovery learns verified successful repairs",async()=>{
 const text=source("src/team/team-recovery.service.ts");
 assert.match(text,/rememberRecoveryOutcome/);
 assert.match(text,/post-repair validation passed/);
});

await check("agent context composes shared and evolution knowledge",async()=>{
 const text=source("src/context/agent-project-context.service.ts");
 assert.match(text,/buildSharedProjectContext/);
 assert.match(text,/buildEvolutionAwareContext/);
});

await check("evolution context consumes durable project knowledge",async()=>{
 const text=source("src/context/evolution-aware-context.service.ts");
 assert.match(text,/listProjectKnowledge/);
});

await check("evolution context consumes learned conventions",async()=>{
 const text=source("src/context/evolution-aware-context.service.ts");
 assert.match(text,/listRepositoryConventions/);
});

await check("evolution context consumes historical failures",async()=>{
 const text=source("src/context/evolution-aware-context.service.ts");
 assert.match(text,/listFailureHistory/);
});

await check("repository learning refreshes conventions after change",async()=>{
 const text=source("src/evolution/repository-learning-lifecycle.service.ts");
 assert.match(text,/captureRepositoryEvolution/);
 assert.match(text,/learnRepositoryConventions/);
});

await check("repository learning persists successful recovery history",async()=>{
 const text=source("src/evolution/repository-learning-lifecycle.service.ts");
 assert.match(text,/rememberFailureResolution/);
});

console.log("");
console.log("============================================================");
console.log(" VEYLITH v1.0 BATCH 5 PRODUCTION INTEGRATION GUARD");
console.log("============================================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed+failed}`);

if(failed===0){
 console.log("");
 console.log("VEYLITH v1.0 BATCH 5 PRODUCTION INTEGRATION VERIFIED");
}else{
 console.log("");
 console.log("VEYLITH v1.0 BATCH 5 PRODUCTION INTEGRATION FAILED");
}

process.exitCode=failed===0?0:1;

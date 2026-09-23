import {spawn} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const results=[];

function spawnSpec(command,args){
 if(process.platform==="win32"&&command==="npm"){
  return{
   command:process.env.ComSpec||"cmd.exe",
   args:["/d","/s","/c","npm",...args]
  };
 }
 return{command,args};
}

function run(name,command,args=[]){
 return new Promise(resolve=>{
  const started=Date.now();
  const spec=spawnSpec(command,args);
  const child=spawn(spec.command,spec.args,{
   cwd:root,
   shell:false,
   stdio:["ignore","pipe","pipe"],
   env:process.env
  });

  let stdout="";
  let stderr="";
  let settled=false;

  child.stdout?.on("data",data=>{
   const text=data.toString();
   stdout+=text;
   process.stdout.write(text);
  });

  child.stderr?.on("data",data=>{
   const text=data.toString();
   stderr+=text;
   process.stderr.write(text);
  });

  child.on("error",error=>{
   if(settled)return;
   settled=true;
   results.push({
    name,
    passed:false,
    code:-1,
    duration:Date.now()-started,
    error:error.message
   });
   resolve(false);
  });

  child.on("close",code=>{
   if(settled)return;
   settled=true;
   const passed=code===0;
   results.push({
    name,
    passed,
    code:code??-1,
    duration:Date.now()-started,
    stdout:stdout.slice(-4000),
    stderr:stderr.slice(-4000)
   });
   resolve(passed);
  });
 });
}

function check(name,condition,detail=""){
 const passed=Boolean(condition);
 results.push({
  name,
  passed,
  code:passed?0:1,
  duration:0,
  error:passed?"":detail
 });
 console.log(`${passed?"PASS":"FAIL"} ${name}${detail&&!passed?`: ${detail}`:""}`);
 return passed;
}

function file(rel){
 return path.join(root,rel);
}

function text(rel){
 return fs.existsSync(file(rel))
  ?fs.readFileSync(file(rel),"utf8")
  :"";
}

console.log("============================================================");
console.log(" VEYLITH v0.8 FULL INTELLIGENCE REGRESSION");
console.log("============================================================");

console.log("\n=== 1. BUILD ===");
await run("TypeScript build","npm",["run","build"]);

console.log("\n=== 2. INTELLIGENCE STRUCTURE ===");

const requiredFiles=[
 "src/intelligence/repository.types.ts",
 "src/intelligence/repository-scanner.service.ts",
 "src/intelligence/repository-classifier.service.ts",
 "src/intelligence/repository-context.service.ts",
 "src/intelligence/context-budget.service.ts",
 "src/intelligence/context-query.service.ts",
 "src/intelligence/repository-intelligence.service.ts",
 "src/intelligence/change.types.ts",
 "src/intelligence/change-classifier.service.ts",
 "src/intelligence/change-analysis.service.ts",
 "src/intelligence/change-guard.service.ts",
 "src/intelligence/change-context.service.ts",
 "src/intelligence/repair-scope.service.ts",
 "src/intelligence/targeted-repair-context.service.ts",
 "src/intelligence/review-evidence.service.ts",
 "src/intelligence/review-decision.service.ts"
];

for(const rel of requiredFiles){
 check(
  `intelligence file ${rel}`,
  fs.existsSync(file(rel)),
  "missing"
 );
}

console.log("\n=== 3. AGENT INTELLIGENCE INTEGRATION ===");

const agentChecks=[
 ["planner","src/agent/planner.service.ts"],
 ["architect","src/agent/architect.service.ts"],
 ["development-planner","src/agent/development-planner.service.ts"],
 ["developer","src/agent/developer.service.ts"],
 ["diagnostic","src/agent/diagnostic.service.ts"],
 ["repair","src/agent/repair.service.ts"],
 ["reviewer","src/agent/reviewer.service.ts"]
];

for(const [name,rel] of agentChecks){
 const source=text(rel);
 check(
  `${name} repository intelligence`,
  source.includes("repositoryIntelligence")||
  source.includes("changeAwareContext")||
  source.includes("targetedRepairContext"),
  "agent is not using the v0.8 context system"
 );
}

console.log("\n=== 4. CHANGE-AWARE DEVELOPMENT ===");

const pipeline=text(
 "src/orchestration/pipeline.service.ts"
);

const orchestrator=text(
 "src/orchestration/orchestrator.service.ts"
);

check(
 "pipeline uses change analysis",
 pipeline.includes("analyzeChange")||
 pipeline.includes("changeAnalysis"),
 "change analysis integration missing"
);

check(
 "pipeline uses change guard",
 pipeline.includes("assertChangeSetSafe"),
 "change guard integration missing"
);

check(
 "initial development receives plan",
 orchestrator.includes(
  "applyDevelopment(result,task,project,context.plan)"
 ),
 "initial change guard is not plan-aware"
);

check(
 "repair development receives plan",
 orchestrator.includes(
  "applyDevelopment(result,task,project,context.plan"
 ),
 "repair change guard is not plan-aware"
);

console.log("\n=== 5. TARGETED REPAIR INTEGRATION ===");

const repair=text(
 "src/agent/repair.service.ts"
);

const diagnostic=text(
 "src/agent/diagnostic.service.ts"
);

check(
 "repair uses targeted context",
 repair.includes("targetedRepairContext"),
 "targeted repair context missing"
);

check(
 "repair enforces repair scope",
 repair.includes("assertRepairScope"),
 "repair scope guard missing"
);

check(
 "diagnostic exposes relevant files",
 diagnostic.includes("relevantFiles"),
 "diagnostic relevantFiles missing"
);

check(
 "diagnostic fingerprints failures",
 diagnostic.includes("failureFingerprint"),
 "failure fingerprinting missing"
);

check(
 "orchestrator supplies repair history",
 orchestrator.includes("historyBeforeRepair")&&
 orchestrator.includes("repairHistory(project.id)"),
 "repair history integration missing"
);

console.log("\n=== 6. AUTONOMOUS REVIEW INTEGRATION ===");

const reviewer=text(
 "src/agent/reviewer.service.ts"
);

check(
 "reviewer builds deterministic evidence",
 reviewer.includes("buildReviewEvidence"),
 "review evidence missing"
);

check(
 "reviewer applies deterministic decision",
 reviewer.includes("finalizeReview"),
 "review decision gate missing"
);

check(
 "review receives actual development",
 orchestrator.includes(
  "reviewProject(task,project,context.architecture!,context.plan!,context.development!,validation)"
 ),
 "reviewProject is not receiving development"
);

check(
 "review rejection remains inside repair loop",
 orchestrator.includes("if(review.approved)break")&&
 orchestrator.includes('type:"review",review'),
 "review rejection repair path missing"
);

check(
 "repair validation checkpoint exists",
 orchestrator.includes("repair_validation_"),
 "repair validation checkpoint missing"
);

console.log("\n=== 7. FOCUSED REPAIR REGRESSION ===");

await run(
 "v0.8 repair regression",
 "node",
 ["scripts/v08-repair-regression.mjs"]
);

console.log("\n=== 8. AUTONOMOUS REVIEW REGRESSION ===");

await run(
 "v0.8 review regression",
 "node",
 ["scripts/v08-review-regression.mjs"]
);

console.log("\n=== 9. v0.7 SECURITY REGRESSION ===");

await run(
 "v0.7 security regression",
 "node",
 ["scripts/security-regression.mjs"]
);

console.log("\n============================================================");
console.log(" FINAL RESULT");
console.log("============================================================");

const failed=results.filter(
 result=>!result.passed
);

const passed=results.filter(
 result=>result.passed
);

console.log(`Passed: ${passed.length}`);
console.log(`Failed: ${failed.length}`);
console.log(`Total:  ${results.length}`);

if(failed.length){
 console.log("\nFAILED CHECKS:");

 for(const failure of failed){
  console.log(`- ${failure.name}`);

  if(failure.error){
   console.log(`  ${failure.error}`);
  }

  if(failure.stderr){
   console.log(
    `  ${failure.stderr.slice(-800)}`
   );
  }
 }

 console.log(
  "\nVEYLITH v0.8 FULL REGRESSION FAILED"
 );

 process.exitCode=1;
}else{
 console.log(
  "\nVEYLITH v0.8 FULL INTELLIGENCE REGRESSION PASSED"
 );
}

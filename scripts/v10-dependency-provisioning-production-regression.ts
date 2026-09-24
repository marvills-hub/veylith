import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {provisionProjectDependencies} from "../src/dependencies/dependency-provisioning.service.js";
import {validateDevelopment} from "../src/orchestration/pipeline.service.js";

let pass=0;
let fail=0;
function check(name:string,value:boolean){
 if(value){pass++;console.log(`PASS ${name}`);}
 else{fail++;console.error(`FAIL ${name}`);}
}
function writeJson(file:string,value:any){
 fs.writeFileSync(file,JSON.stringify(value,null,2),"utf8");
}
const root=fs.mkdtempSync(path.join(os.tmpdir(),"veylith-74j4-"));
const task={id:"fixture_task_74j4"};
const project={id:"fixture_project_74j4",workspace:root};

try{
 console.log("\n--- REAL PROVISIONING FIXTURE ---");
 writeJson(path.join(root,"package.json"),{
  name:"veylith-74j4-fixture",
  version:"1.0.0",
  private:true,
  scripts:{test:"node test.js"},
  dependencies:{"is-number":"7.0.0"}
 });
 fs.writeFileSync(path.join(root,"test.js"),'const n=require("is-number");if(!n(7))process.exit(1);console.log("fixture-ok");\n',"utf8");

 const first=await provisionProjectDependencies(root,task.id,project.id);
 check("first provisioning required",first.required===true);
 check("first provisioning attempted",first.attempted===true);
 check("first provisioning succeeds",first.success===true);
 check("first provisioning used npm",first.command==="npm");
 check("first provisioning created node_modules",fs.existsSync(path.join(root,"node_modules")));
 check("first provisioning created dependency",fs.existsSync(path.join(root,"node_modules","is-number")));
 check("first provisioning created package-lock",fs.existsSync(path.join(root,"package-lock.json")));
 check("first provisioning created Veylith marker",fs.existsSync(path.join(root,"node_modules",".veylith-dependencies")));

 const second=await provisionProjectDependencies(root,task.id,project.id);
 check("unchanged package state remains required",second.required===true);
 check("unchanged package state skips execution",second.attempted===false);
 check("unchanged package state remains successful",second.success===true);
 check("unchanged package state recognized as provisioned",second.reason.includes("already provisioned"));

 const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
 pkg.devDependencies={"is-odd":"3.0.1"};
 writeJson(path.join(root,"package.json"),pkg);

 const third=await provisionProjectDependencies(root,task.id,project.id);
 check("manifest change invalidates marker",third.attempted===true);
 check("lockfile causes reprovisioning command",third.args[0]==="ci");
 check("changed manifest reprovision succeeds",third.success===true);
 check("new dependency installed",fs.existsSync(path.join(root,"node_modules","is-odd")));

 console.log("\n--- validateDevelopment PRODUCTION PATH ---");
 const validation=await validateDevelopment({
  files:[],
  commands:[{
   command:"npm",
   args:["test"],
   purpose:"Fixture validation"
  }]
 } as any,task,project);

 check("validateDevelopment succeeds after provisioning",validation.success===true);
 check("developer validation command executed",validation.results.some((r:any)=>r.command==="npm"&&r.args?.[0]==="test"));
 check("fixture test output observed",validation.results.some((r:any)=>String(r.stdout||"").includes("fixture-ok")));

 console.log("\n--- NO-DEPENDENCY FIXTURE ---");
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),"veylith-74j4-empty-"));
 try{
  writeJson(path.join(empty,"package.json"),{
   name:"empty-fixture",
   version:"1.0.0",
   scripts:{test:"node -e \"process.exit(0)\""}
  });
  const skipped=await provisionProjectDependencies(empty,"fixture_task_empty","fixture_project_empty");
  check("dependency-free project does not require install",skipped.required===false);
  check("dependency-free project does not execute install",skipped.attempted===false);
  check("dependency-free project succeeds",skipped.success===true);
  check("dependency-free project does not create node_modules",!fs.existsSync(path.join(empty,"node_modules")));
 }finally{
  fs.rmSync(empty,{recursive:true,force:true});
 }

 console.log("\n--- INVALID MANIFEST FIXTURE ---");
 const invalid=fs.mkdtempSync(path.join(os.tmpdir(),"veylith-74j4-invalid-"));
 try{
  fs.writeFileSync(path.join(invalid,"package.json"),"{broken","utf8");
  const rejected=await provisionProjectDependencies(invalid,"fixture_task_invalid","fixture_project_invalid");
  check("invalid manifest requires resolution",rejected.required===true);
  check("invalid manifest does not execute npm",rejected.attempted===false);
  check("invalid manifest fails deterministically",rejected.success===false);
 }finally{
  fs.rmSync(invalid,{recursive:true,force:true});
 }
}finally{
 fs.rmSync(root,{recursive:true,force:true});
}

console.log(`\n7.4J.4 PRODUCTION AUTHORITY: ${pass}/${pass+fail}`);
if(fail)process.exitCode=1;


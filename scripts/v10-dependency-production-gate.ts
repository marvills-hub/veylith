import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {db} from "../src/database/database.js";
import {provisionProjectDependencies} from "../src/dependencies/dependency-provisioning.service.js";
import {validateDevelopment} from "../src/orchestration/pipeline.service.js";

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

function writeJson(file:string,value:any){
 fs.writeFileSync(file,JSON.stringify(value,null,2),"utf8");
}

function registerProject(id:string,workspace:string){
 const now=new Date().toISOString();
 db.prepare("DELETE FROM projects WHERE id=?").run(id);
 db.prepare(`
  INSERT INTO projects(
   id,name,slug,status,phase,progress,workspace,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  "7.4J.6B Dependency Fixture",
  id,
  "running",
  "validation",
  0,
  workspace,
  now,
  now
 );
}

function removeProject(id:string){
 db.prepare("DELETE FROM projects WHERE id=?").run(id);
}

const suffix=crypto.randomBytes(5).toString("hex");
const projectId=`fixture_project_74j6b_${suffix}`;
const taskId=`fixture_task_74j6b_${suffix}`;
const workspaceRoot=path.resolve(process.cwd(),"workspaces");
const workspace=path.join(workspaceRoot,`fixture-74j6b-${suffix}`);

fs.mkdirSync(workspaceRoot,{recursive:true});
fs.mkdirSync(workspace,{recursive:true});

try{
 registerProject(projectId,workspace);

 console.log("\n--- AUTHORITY ---");

 const authority=db.prepare(
  "SELECT id,workspace FROM projects WHERE id=?"
 ).get(projectId) as any;

 check("fixture project registered",authority?.id===projectId);
 check(
  "fixture workspace registered exactly",
  path.resolve(authority?.workspace||"")===path.resolve(workspace)
 );
 check(
  "fixture lives under Veylith workspaces",
  path.resolve(workspace).startsWith(path.resolve(workspaceRoot)+path.sep)
 );

 console.log("\n--- FIRST PROVISIONING ---");

 writeJson(path.join(workspace,"package.json"),{
  name:"veylith-74j6b-fixture",
  version:"1.0.0",
  private:true,
  scripts:{
   test:"node test.js"
  },
  dependencies:{
   "is-number":"7.0.0"
  }
 });

 fs.writeFileSync(
  path.join(workspace,"test.js"),
  'const n=require("is-number");if(!n(7))process.exit(1);console.log("fixture-ok");\n',
  "utf8"
 );

 const first=await provisionProjectDependencies(
  workspace,
  taskId,
  projectId
 );

 console.log(JSON.stringify(first,null,2));

 check("first provisioning required",first.required===true);
 check("first provisioning attempted",first.attempted===true);
 check("first provisioning succeeds",first.success===true);
 check("first provisioning uses npm",first.command==="npm");
 check("first provisioning uses npm install",first.args[0]==="install");

 check(
  "node_modules created",
  fs.existsSync(path.join(workspace,"node_modules"))
 );

 check(
  "dependency installed",
  fs.existsSync(path.join(workspace,"node_modules","is-number"))
 );

 check(
  "package-lock created",
  fs.existsSync(path.join(workspace,"package-lock.json"))
 );

 check(
  "Veylith marker created",
  fs.existsSync(
   path.join(workspace,"node_modules",".veylith-dependencies")
  )
 );

 console.log("\n--- UNCHANGED STATE ---");

 const second=await provisionProjectDependencies(
  workspace,
  taskId,
  projectId
 );

 console.log(JSON.stringify(second,null,2));

 check("unchanged state successful",second.success===true);
 check("unchanged state skips execution",second.attempted===false);

 check(
  "unchanged state recognized",
  second.reason.includes("already provisioned")
 );

 console.log("\n--- PRODUCTION validateDevelopment PATH ---");

 const validation=await validateDevelopment(
  {
   files:[],
   commands:[
    {
     command:"npm",
     args:["test"],
     purpose:"Fixture validation"
    }
   ]
  } as any,
  {id:taskId},
  {id:projectId,workspace}
 );

 console.log(JSON.stringify(validation,null,2));

 check(
  "validateDevelopment succeeds",
  validation.success===true
 );

 check(
  "npm test executed",
  validation.results.some(
   (r:any)=>r.command==="npm"&&r.args?.[0]==="test"
  )
 );

 check(
  "fixture test output observed",
  validation.results.some(
   (r:any)=>String(r.stdout||"").includes("fixture-ok")
  )
 );

 console.log("\n--- MANIFEST CHANGE WITH EXISTING LOCKFILE ---");

 const pkg=JSON.parse(
  fs.readFileSync(path.join(workspace,"package.json"),"utf8")
 );

 pkg.devDependencies={
  "is-odd":"3.0.1"
 };

 writeJson(
  path.join(workspace,"package.json"),
  pkg
 );

 const changed=await provisionProjectDependencies(
  workspace,
  taskId,
  projectId
 );

 console.log(JSON.stringify(changed,null,2));

 check(
  "manifest change forces provisioning",
  changed.attempted===true
 );

 if(changed.success){
  check(
   "changed dependency installed",
   fs.existsSync(path.join(workspace,"node_modules","is-odd"))
  );
 }else{
  console.log("J74J6B_LOCK_MISMATCH_CONFIRMED");
 }

 console.log(
  `\n7.4J.6B PRODUCTION GATE: ${passed}/${passed+failed}`
 );

 if(!changed.success){
  process.exitCode=2;
 }else if(failed){
  process.exitCode=1;
 }
}finally{
 try{
  removeProject(projectId);
 }catch(error){
  console.error(
   "Fixture DB cleanup failed:",
   error instanceof Error?error.message:String(error)
  );
  process.exitCode=3;
 }

 try{
  fs.rmSync(workspace,{recursive:true,force:true});
 }catch(error){
  console.error(
   "Fixture workspace cleanup failed:",
   error instanceof Error?error.message:String(error)
  );
  process.exitCode=3;
 }

 const remaining=db.prepare(
  "SELECT id FROM projects WHERE id=?"
 ).get(projectId);

 if(remaining){
  console.error("FAIL fixture project authority remains");
  process.exitCode=3;
 }else{
  console.log("PASS fixture project authority removed");
 }

 if(fs.existsSync(workspace)){
  console.error("FAIL fixture workspace remains");
  process.exitCode=3;
 }else{
  console.log("PASS fixture workspace removed");
 }
}

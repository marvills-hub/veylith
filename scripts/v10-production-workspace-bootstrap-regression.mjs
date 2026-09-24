import fs from"node:fs";
import path from"node:path";
import crypto from"node:crypto";
import{db}from"../src/database/database.js";
import{ROOT}from"../src/config/config.js";
import{bootstrapAutonomousProjectDeterministic}from"../src/goals/autonomous-project.service.js";

let pass=0,fail=0;
const check=(name,value)=>{
 if(value){console.log(`PASS ${name}`);pass++}
 else{console.log(`FAIL ${name}`);fail++}
};
const token=crypto.randomBytes(5).toString("hex");
let projectId="";
let goalId="";
let workspace="";

console.log("\nVEYLITH v1.0 - PRODUCTION WORKSPACE BOOTSTRAP");

try{
 const result=bootstrapAutonomousProjectDeterministic({
  name:`Workspace Bootstrap ${token}`,
  request:"Verify production autonomous workspace creation.",
  analysis:{
   title:"Workspace bootstrap",
   objective:"Verify workspace creation.",
   priority:"normal",
   requirements:[
    {text:"Create a valid autonomous project workspace.",required:true}
   ],
   acceptanceCriteria:[
    "The autonomous project has a persistent workspace directory."
   ],
   constraints:[],
   assumptions:[],
   clarificationNeeded:true,
   clarificationQuestions:["Fixture intentionally stops before graph creation."]
  }
 });

 projectId=result.projectId;
 goalId=result.goalId;

 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(projectId);
 workspace=String(project?.workspace||"");

 check("production project created",Boolean(project));
 check("workspace persisted",Boolean(workspace));
 check("workspace is absolute",path.isAbsolute(workspace));
 check("workspace is inside configured ROOT",
  path.relative(ROOT,workspace)!==""&&
  !path.relative(ROOT,workspace).startsWith("..")&&
  !path.isAbsolute(path.relative(ROOT,workspace))
 );
 check("workspace physically exists",fs.existsSync(workspace));
 check("workspace is directory",fs.existsSync(workspace)&&fs.statSync(workspace).isDirectory());
 check("bootstrap paused safely for clarification",result.status==="waiting_clarification");

}catch(error){
 console.error(error);
 fail++;
}finally{
 try{
  if(goalId)db.prepare("DELETE FROM project_goals WHERE id=?").run(goalId);
  if(projectId)db.prepare("DELETE FROM projects WHERE id=?").run(projectId);
  if(workspace&&fs.existsSync(workspace))fs.rmSync(workspace,{recursive:true,force:true});
 }catch(error){
  console.error("cleanup",error);
  fail++;
 }

 check("fixture project cleaned",!projectId||Number(db.prepare("SELECT COUNT(*) count FROM projects WHERE id=?").get(projectId)?.count??0)===0);
 check("fixture workspace cleaned",!workspace||!fs.existsSync(workspace));

 console.log(`\n${pass}/${pass+fail} passed`);
 if(fail)process.exitCode=1;
}



import {mkdir} from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {db,memory} from "../database/database.js";
import {ROOT,MAX_REPAIR_ATTEMPTS,AI_KEY,now} from "../config/config.js";
import {event,setWorker,setPhase} from "./telemetry.js";
import {createPlan,repairPlan,applyPlan,validatePlan} from "../agent/planner.service.js";
import {initializeGit,publishToGitHub} from "../git/git.service.js";
import {walkFiles} from "../runtime/filesystem.service.js";
const makeId=(prefix:string)=>`${prefix}_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
const makeSlug=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55)||`project-${Date.now()}`;
export function createTask(name:string,prompt:string){
 const projectId=makeId("prj"),taskId=makeId("tsk"),created=now();
 let slug=makeSlug(name);
 if(db.prepare("SELECT id FROM projects WHERE slug=?").get(slug))slug=`${slug}-${Date.now()}`;
 const workspace=path.join(ROOT,slug);
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare("INSERT INTO projects(id,name,slug,status,phase,progress,workspace,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(projectId,name,slug,"queued","queued",0,workspace,created,created);
  db.prepare("INSERT INTO tasks(id,project_id,title,prompt,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(taskId,projectId,name,prompt,"queued","queued",created,created);
  db.exec("COMMIT");
 }catch(error){db.exec("ROLLBACK");throw error}
 event("task.created",name,{taskId,projectId,data:{prompt}});
 return{projectId,taskId,status:"queued"};
}
export async function executeTask(task:any){
 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(task.project_id) as any;
 if(!project)throw new Error("Project not found.");
 await mkdir(project.workspace,{recursive:true});
 const started=now();
 db.prepare("UPDATE tasks SET status='running',phase='planning',attempts=attempts+1,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?").run(started,started,task.id);
 db.prepare("UPDATE projects SET status='active',phase='planning',progress=5,updated_at=? WHERE id=?").run(started,project.id);
 setWorker("busy","planning",task.id,project.id);
 event("task.started",task.title,{taskId:task.id,projectId:project.id});
 setPhase(task.id,project.id,"planning",10);
 const plan=await createPlan(task,project);
 db.prepare("UPDATE projects SET summary=?,updated_at=? WHERE id=?").run(plan.summary||null,now(),project.id);
 memory(project.id,"plan",JSON.stringify({summary:plan.summary,architecture:plan.architecture||[]}));
 event("plan.created",plan.summary||"Development plan created",{taskId:task.id,projectId:project.id});
 setPhase(task.id,project.id,"coding",35);
 event("agent.coding","Writing implementation",{taskId:task.id,projectId:project.id});
 await applyPlan(plan,task,project);
 setPhase(task.id,project.id,"testing",65);
 event("agent.testing","Running project validation",{taskId:task.id,projectId:project.id});
 let validation=await validatePlan(plan,task,project);
 let repairAttempt=0;
 while(!validation.success&&repairAttempt<MAX_REPAIR_ATTEMPTS){
  repairAttempt++;
  db.prepare("UPDATE tasks SET repair_attempts=?,phase='repairing',updated_at=? WHERE id=?").run(repairAttempt,now(),task.id);
  setPhase(task.id,project.id,"repairing",Math.min(68+repairAttempt*6,85));
  event("repair.started",`Autonomous repair ${repairAttempt}/${MAX_REPAIR_ATTEMPTS}`,{taskId:task.id,projectId:project.id,level:"warn",data:{failure:validation.failure}});
  if(!AI_KEY)throw new Error(`Validation failed and AI repair requires OPENAI_API_KEY. ${validation.failure?.stderr||validation.failure?.stdout||""}`);
  const repair=await repairPlan(task,project,validation.failure,repairAttempt);
  memory(project.id,"repair",JSON.stringify({attempt:repairAttempt,analysis:repair.analysis}));
  event("repair.analysis",repair.analysis||"Repair generated",{taskId:task.id,projectId:project.id});
  await applyPlan(repair,task,project);
  setPhase(task.id,project.id,"retesting",80);
  validation=await validatePlan(repair,task,project);
  if(validation.success)event("repair.success",`Repair ${repairAttempt} passed validation`,{taskId:task.id,projectId:project.id});
 }
 if(!validation.success)throw new Error(`Validation failed after ${repairAttempt} repair attempts.`);
 memory(project.id,"validation",JSON.stringify(validation.results));
 event("validation.passed","All project validation commands passed",{taskId:task.id,projectId:project.id});
 await initializeGit(task,project);
 const freshProject=db.prepare("SELECT * FROM projects WHERE id=?").get(project.id) as any;
 const github=await publishToGitHub(task,freshProject);
 setPhase(task.id,project.id,"finalizing",98);
 const completed=now();
 const result={summary:plan.summary,repairAttempts:repairAttempt,files:await walkFiles(project.workspace),validation:validation.results,github};
 db.prepare("UPDATE tasks SET status='completed',phase='completed',result=?,error=NULL,completed_at=?,updated_at=? WHERE id=?").run(JSON.stringify(result),completed,completed,task.id);
 db.prepare("UPDATE projects SET status='completed',phase='completed',progress=100,summary=?,completed_at=?,updated_at=? WHERE id=?").run(plan.summary||null,completed,completed,project.id);
 memory(project.id,"completion",JSON.stringify(result));
 event("task.completed",`${task.title} completed`,{taskId:task.id,projectId:project.id,data:{repairAttempts:repairAttempt,github}});
 event("project.completed",`${project.name} completed successfully`,{taskId:task.id,projectId:project.id,data:{github}});
}
export async function failTask(task:any,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const current=db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id) as any;
 const retry=current.attempts<current.max_attempts;
 db.prepare("UPDATE tasks SET status=?,phase=?,error=?,updated_at=? WHERE id=?").run(retry?"queued":"failed",retry?"retrying":"failed",message,now(),task.id);
 if(retry)event("task.retry",`Task scheduled for retry: ${message}`,{taskId:task.id,projectId:task.project_id,level:"warn",data:{attempt:current.attempts,max:current.max_attempts}});
 else{
  db.prepare("UPDATE projects SET status='failed',phase='failed',updated_at=? WHERE id=?").run(now(),task.project_id);
  memory(task.project_id,"failure",message);
  event("task.failed",message,{taskId:task.id,projectId:task.project_id,level:"error"});
 }
}

import {mkdir} from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import {db,memory} from "../database/database.js";
import {ROOT,MAX_REPAIR_ATTEMPTS,AI_KEY,now} from "../config/config.js";
import {event,setWorker,setPhase} from "./telemetry.js";
import {createPlan,repairPlan,applyPlan,validatePlan} from "../agent/planner.service.js";
import {initializeGit,publishToGitHub} from "../git/git.service.js";
import {walkFiles} from "../runtime/filesystem.service.js";
import {executeAutonomousPipeline} from "../orchestration/orchestrator.service.js";
import {getAIProvider} from "../agent/provider.service.js";
import {AIProviderError,isPermanentAIError} from "./ai-error.service.js";
import {enqueueTask,pauseTaskJob,resumeTaskJob} from "../jobs/job.service.js";

const makeId=(prefix:string)=>`${prefix}_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
const makeSlug=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55)||`project-${Date.now()}`;

export function createTask(name:string,prompt:string,mode:"autonomous"|"demo"="autonomous"){
 if(mode==="autonomous"){
  const provider=getAIProvider();
  if(!provider.configured)throw new Error(`AI provider "${provider.name}" is not configured. Configure an AI provider before creating autonomous tasks.`);
 }
 const projectId=makeId("prj"),taskId=makeId("tsk"),created=now();
 let slug=makeSlug(name);
 if(db.prepare("SELECT id FROM projects WHERE slug=?").get(slug))slug=`${slug}-${Date.now()}`;
 const workspace=path.join(ROOT,slug);
 db.exec("BEGIN IMMEDIATE");
 try{
  db.prepare("INSERT INTO projects(id,name,slug,status,phase,progress,workspace,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(projectId,name,slug,"queued","queued",0,workspace,created,created);
  db.prepare("INSERT INTO tasks(id,project_id,title,prompt,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(taskId,projectId,name,prompt,"queued","queued",created,created);
  db.prepare("INSERT INTO project_memory(project_id,type,content,created_at) VALUES(?,?,?,?)").run(projectId,"execution_mode",mode,created);
  db.exec("COMMIT");
 }catch(error){
  db.exec("ROLLBACK");
  throw error;
 }
 event("task.created",name,{taskId,projectId,data:{prompt,mode}});
 const job=enqueueTask(taskId);
 return{projectId,taskId,jobId:job.id,status:"queued",mode};
}

function executionMode(projectId:string){
 const row=db.prepare("SELECT content FROM project_memory WHERE project_id=? AND type='execution_mode' ORDER BY id DESC LIMIT 1").get(projectId) as any;
 return row?.content==="demo"?"demo":"autonomous";
}

async function executeDemoTask(task:any,project:any){
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
  await applyPlan(repair,task,project);
  setPhase(task.id,project.id,"retesting",80);
  validation=await validatePlan(repair,task,project);
 }
 if(!validation.success)throw new Error(`Validation failed after ${repairAttempt} repair attempts.`);
 memory(project.id,"validation",JSON.stringify(validation.results));
 event("validation.passed","All project validation commands passed",{taskId:task.id,projectId:project.id});
 await initializeGit(task,project);
 const freshProject=db.prepare("SELECT * FROM projects WHERE id=?").get(project.id) as any;
 const github=await publishToGitHub(task,freshProject);
 setPhase(task.id,project.id,"finalizing",98);
 return{summary:plan.summary,repairAttempts:repairAttempt,files:await walkFiles(project.workspace),validation:validation.results,github};
}

export async function executeTask(task:any){
 const project=db.prepare("SELECT * FROM projects WHERE id=?").get(task.project_id) as any;
 if(!project)throw new Error("Project not found.");
 await mkdir(project.workspace,{recursive:true});
 const mode=executionMode(project.id);
 if(mode==="autonomous"){
  const provider=getAIProvider();
  if(!provider.configured)throw new AIProviderError(`AI provider "${provider.name}" is not configured.`,{provider:provider.name,retryable:true});
 }
 const started=now();
 const isResume=task.phase==="resuming";
 const startPhase=mode==="demo"?"planning":isResume?(project.phase&&project.phase!=="failed"?project.phase:"validation"):"architecture";
 if(isResume){
  db.prepare("UPDATE tasks SET status='running',phase=?,error=NULL,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?").run(startPhase,started,started,task.id);
  db.prepare("UPDATE projects SET status='active',phase=?,updated_at=? WHERE id=?").run(startPhase,started,project.id);
  setWorker("busy",startPhase,task.id,project.id);
  event("task.resuming",task.title,{taskId:task.id,projectId:project.id,data:{mode,attempts:task.attempts,repairAttempts:task.repair_attempts}});
 }else{
  db.prepare("UPDATE tasks SET status='running',phase=?,attempts=attempts+1,error=NULL,started_at=COALESCE(started_at,?),updated_at=? WHERE id=?").run(startPhase,started,started,task.id);
  db.prepare("UPDATE projects SET status='active',phase=?,progress=?,updated_at=? WHERE id=?").run(startPhase,mode==="demo"?5:2,started,project.id);
  setWorker("busy",startPhase,task.id,project.id);
  event("task.started",task.title,{taskId:task.id,projectId:project.id,data:{mode}});
 }
 let result:Awaited<ReturnType<typeof executeDemoTask>>|Awaited<ReturnType<typeof executeAutonomousPipeline>>;
 let summary:string|null;
 if(mode==="demo"){
  const demoResult=await executeDemoTask(task,project);
  result=demoResult;
  summary=demoResult.summary||null;
 }else{
  const autonomousResult=await executeAutonomousPipeline(task,project);
  result=autonomousResult;
  summary=autonomousResult.implementation||autonomousResult.plan||autonomousResult.architecture||null;
 }
 const completed=now();
 db.prepare("UPDATE tasks SET status='completed',phase='completed',result=?,error=NULL,completed_at=?,updated_at=? WHERE id=?").run(JSON.stringify(result),completed,completed,task.id);
 db.prepare("UPDATE projects SET status='completed',phase='completed',progress=100,summary=?,completed_at=?,updated_at=? WHERE id=?").run(summary||null,completed,completed,project.id);
 memory(project.id,"task_result",JSON.stringify(result));
 event("task.completed",`${task.title} completed`,{taskId:task.id,projectId:project.id,data:{mode}});
 event("project.completed",`${project.name} completed successfully`,{taskId:task.id,projectId:project.id});
}

export function pauseTaskForAI(task:any,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const time=now();
 db.prepare("UPDATE tasks SET status='paused',phase='waiting_ai',error=?,updated_at=? WHERE id=?").run(message,time,task.id);
 db.prepare("UPDATE projects SET status='paused',phase='waiting_ai',updated_at=? WHERE id=?").run(time,task.project_id);
 memory(task.project_id,"pause",JSON.stringify({reason:"ai_unavailable",message,time}));
 event("task.paused",`Task paused while waiting for AI provider: ${message}`,{taskId:task.id,projectId:task.project_id,level:"warn",data:{reason:"ai_unavailable"}});
 pauseTaskJob(task.id,message);
 setWorker("online","idle");
}

export function resumeTask(taskId:string,reason="manual"){
 const task=db.prepare("SELECT * FROM tasks WHERE id=?").get(taskId) as any;
 if(!task)throw new Error("Task not found.");
 if(task.status==="completed")throw new Error("Completed tasks cannot be resumed.");
 if(task.status==="running")throw new Error("Running tasks cannot be resumed.");
 const time=now();
 db.prepare("UPDATE tasks SET status='queued',phase='resuming',error=NULL,updated_at=? WHERE id=?").run(time,task.id);
 db.prepare("UPDATE projects SET status='queued',phase='resuming',updated_at=? WHERE id=?").run(time,task.project_id);
 event("task.resumed",`Task queued for checkpoint resume`,{taskId:task.id,projectId:task.project_id,data:{reason}});
 const job=resumeTaskJob(task.id);
 return{id:task.id,projectId:task.project_id,jobId:job.id,status:"queued",phase:"resuming"};
}

export async function failTask(task:any,error:unknown){
 if(error instanceof AIProviderError&&error.retryable){
  pauseTaskForAI(task,error);
  return;
 }
 const message=error instanceof Error?error.message:String(error);
 const current=db.prepare("SELECT * FROM tasks WHERE id=?").get(task.id) as any;
 const retry=current.attempts<current.max_attempts&&!isPermanentAIError(error);
 db.prepare("UPDATE tasks SET status=?,phase=?,error=?,updated_at=? WHERE id=?").run(retry?"queued":"failed",retry?"retrying":"failed",message,now(),task.id);
 if(retry){
  event("task.retry",`Task scheduled for retry: ${message}`,{taskId:task.id,projectId:task.project_id,level:"warn",data:{attempt:current.attempts,max:current.max_attempts}});
 }else{
  db.prepare("UPDATE projects SET status='failed',phase='failed',updated_at=? WHERE id=?").run(now(),task.project_id);
  memory(task.project_id,"failure",message);
  event("task.failed",message,{taskId:task.id,projectId:task.project_id,level:"error"});
 }
}




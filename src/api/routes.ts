import express from "express";
import {requestLogging} from "../logging/request-logging.middleware.js";
import {queryLogs,logStats} from "../logging/log-query.service.js";
import {logFiles,logStorageStatus} from "../logging/log-storage.service.js";
import path from "node:path";
import {readFile} from "node:fs/promises";
import {db} from "../database/database.js";
import {createAutonomousProject,createTask,resumeTask} from "../core/task.service.js";
import {walkFiles,safeTarget} from "../runtime/filesystem.service.js";
import {addClient,removeClient} from "../core/telemetry.js";
import {VERSION,GITHUB_ENABLED,GITHUB_OWNER,GITHUB_VISIBILITY,WORKER_ID,now} from "../config/config.js";
import {aiProviderStatus,aiProviderHealth,availableAIProviders} from "../agent/provider.service.js";
import {providerCircuits} from "../core/provider-circuit.service.js";
import {workerPoolStatus} from "../workers/worker-pool.service.js";
import {listSlots} from "../workers/worker-slot.repository.js";
import {listJobs,queueStats} from "../jobs/job.repository.js";
import {cancelTaskJob,pauseTask,changeTaskPriority,scheduleTask} from "../jobs/job.service.js";
import {sandboxStatus} from "../sandbox/sandbox-manager.service.js";
import {securityStatus,securityEvents} from "../security/security-status.service.js";
import {activeProjectTeams,projectTeam} from "../dashboard/autonomous-team.service.js";
import {publicationForProject,publicationOverview} from "../dashboard/publication-monitor.service.js";

const DEMO_PROMPT="[VEYLITH_DEMO] Create and test the autonomous Veylith hello API.";

export function createApp(){
 const app=express();
 app.use(requestLogging);
 app.use(express.json({limit:"5mb"}));
 app.use(express.static(path.resolve("public")));

 app.get("/api/health",(_req,res)=>{
  res.json({
   name:"Veylith",
   version:VERSION,
   status:"online",
   workerPool:workerPoolStatus(),
   workerSlots:listSlots(),
   ai:aiProviderStatus(),
   providerCircuits:providerCircuits(),
   github:{configured:GITHUB_ENABLED,owner:GITHUB_OWNER||null,visibility:GITHUB_VISIBILITY},
   worker:db.prepare("SELECT * FROM workers WHERE id=?").get(WORKER_ID),
   time:now()
  });
 });

 app.get("/api/ai",async(_req,res)=>{
  try{res.json({active:await aiProviderHealth(),providers:availableAIProviders()})}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.get("/api/dashboard",async(_req,res)=>{
  try{
   const workers=db.prepare("SELECT * FROM workers ORDER BY heartbeat_at DESC").all();
   const projects=db.prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 50").all();
   const tasks=db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100").all();
   const events=db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 150").all().reverse();
   const metrics=db.prepare("SELECT * FROM metrics ORDER BY id DESC LIMIT 120").all().reverse();
    const developmentSteps=db.prepare("SELECT * FROM development_steps ORDER BY created_at DESC LIMIT 300").all().reverse();
    const autonomousTeams=activeProjectTeams(20);
    const publications=publicationOverview(50);
   const stats=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running,SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END) paused,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(repair_attempts) repairs FROM tasks`).get();
   const [sandbox,security]=await Promise.all([sandboxStatus(),securityStatus()]);
   res.json({
    version:VERSION,
    workerPool:workerPoolStatus(),
    workerSlots:listSlots(),
    ai:aiProviderStatus(),
    providerCircuits:providerCircuits(),
    github:{configured:GITHUB_ENABLED,owner:GITHUB_OWNER||null,visibility:GITHUB_VISIBILITY},
    sandbox,
    security,
    workers,
    projects,
    tasks,
    jobs:listJobs(100),
    queue:queueStats(),
    events,
    metrics,
    developmentSteps,
    autonomousTeams,
    publications,
    stats
   });
  }catch(error){
   res.status(500).json({error:error instanceof Error?error.message:String(error)});
  }
 });

 app.get("/api/jobs",(_req,res)=>{
  res.json({stats:queueStats(),jobs:listJobs(200)});
 });

 app.get("/api/security",async(_req,res)=>{
  try{res.json(await securityStatus())}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.get("/api/security/events",(req,res)=>{
  try{
   const requested=Number(req.query.limit||100);
   res.json({events:securityEvents(Number.isFinite(requested)?requested:100)});
  }catch(error){
   res.status(500).json({error:error instanceof Error?error.message:String(error)});
  }
 });

 app.get("/api/sandbox",async(_req,res)=>{
  try{res.json(await sandboxStatus())}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/tasks/:id/cancel",(req,res)=>{
  try{res.json(cancelTaskJob(req.params.id))}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/tasks/:id/pause",(req,res)=>{
  try{res.json(pauseTask(req.params.id,String(req.body?.reason||"Paused by user")))}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/tasks/:id/priority",(req,res)=>{
  const priority=Number(req.body?.priority);
  if(!Number.isFinite(priority)){res.status(400).json({error:"Numeric priority is required."});return}
  try{res.json(changeTaskPriority(req.params.id,priority))}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/tasks/:id/schedule",(req,res)=>{
  const availableAt=String(req.body?.availableAt||"").trim();
  if(!availableAt){res.status(400).json({error:"availableAt is required."});return}
  try{res.json(scheduleTask(req.params.id,availableAt))}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.get("/api/logs",(req,res)=>{
  const limit=Number(req.query.limit||200);
  res.json({
   logs:queryLogs({
    level:typeof req.query.level==="string"?req.query.level as any:undefined,
    component:typeof req.query.component==="string"?req.query.component:undefined,
    taskId:typeof req.query.taskId==="string"?req.query.taskId:undefined,
    projectId:typeof req.query.projectId==="string"?req.query.projectId:undefined,
    jobId:typeof req.query.jobId==="string"?req.query.jobId:undefined,
    runtimeId:typeof req.query.runtimeId==="string"?req.query.runtimeId:undefined,
    search:typeof req.query.search==="string"?req.query.search:undefined,
    limit:Number.isFinite(limit)?limit:200
   })
  });
 });
 app.get("/api/logs/stats",(_req,res)=>{
  res.json({
   stats:logStats(),
   storage:logStorageStatus()
  });
 });
 app.get("/api/logs/files",(_req,res)=>{
  res.json({files:logFiles()});
 });
 app.get("/api/events",(req,res)=>{
  res.setHeader("Content-Type","text/event-stream");
  res.setHeader("Cache-Control","no-cache");
  res.setHeader("Connection","keep-alive");
  res.flushHeaders();
  addClient(res);
  res.write(`data: ${JSON.stringify({channel:"connected",payload:{time:now(),version:VERSION}})}\n\n`);
  req.on("close",()=>removeClient(res));
 });

 app.post("/api/tasks",async(req,res)=>{
  const prompt=String(req.body?.prompt||"").trim();
  const name=String(req.body?.name||"").trim()||`Veylith Project ${Date.now()}`;
  if(prompt.length<5){res.status(400).json({error:"Development request is required."});return}
  try{res.status(201).json(await createAutonomousProject(name,prompt))}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/tasks/:id/resume",(req,res)=>{
  try{res.json(resumeTask(req.params.id,"manual_api"))}
  catch(error){res.status(400).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.post("/api/demo",(_req,res)=>{
  try{res.status(201).json(createTask(`Veylith Hello ${Date.now()}`,DEMO_PROMPT,"demo"))}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });

 app.get("/api/projects/:id/publication",(req,res)=>{
  try{
   const publication=publicationForProject(req.params.id);
   if(!publication){
    res.status(404).json({error:"Project not found."});
    return;
   }
   res.json(publication);
  }catch(error){
   res.status(500).json({error:error instanceof Error?error.message:String(error)});
  }
 });
 app.get("/api/projects/:id/team",(req,res)=>{
  try{
   const team=projectTeam(req.params.id);
   if(!team){res.status(404).json({error:"Project not found."});return}
   res.json(team);
  }catch(error){
   res.status(500).json({error:error instanceof Error?error.message:String(error)});
  }
 });
 app.get("/api/projects/:id",(req,res)=>{
  const project=db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id);
  if(!project){res.status(404).json({error:"Project not found."});return}
  res.json({
   project,
   tasks:db.prepare("SELECT * FROM tasks WHERE project_id=? ORDER BY created_at DESC").all(req.params.id),
   memories:db.prepare("SELECT * FROM project_memory WHERE project_id=? ORDER BY id DESC").all(req.params.id),
   executions:db.prepare("SELECT * FROM executions WHERE project_id=? ORDER BY id DESC").all(req.params.id),
   events:db.prepare("SELECT * FROM events WHERE project_id=? ORDER BY id DESC LIMIT 200").all(req.params.id)
  });
 });

 app.get("/api/projects/:id/files",async(req,res)=>{
  const project=db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id) as any;
  if(!project){res.status(404).json({error:"Project not found."});return}
  try{
   res.json({project,files:await walkFiles(project.workspace)});
  }catch(error){
   res.status(400).json({error:error instanceof Error?error.message:String(error)});
  }
 });

 app.get("/api/projects/:id/file",async(req,res)=>{
  const project=db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id) as any;
  if(!project){res.status(404).json({error:"Project not found."});return}
  try{
   const relative=String(req.query.path||"");
   res.json({path:relative,content:await readFile(safeTarget(project.workspace,relative),"utf8")});
  }catch(error){
   res.status(404).json({error:error instanceof Error?error.message:"File not found."});
  }
 });

 app.use((_req,res)=>res.sendFile(path.resolve("public/index.html")));
 return app;
}








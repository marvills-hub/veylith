import express from "express";
import path from "node:path";
import {readFile} from "node:fs/promises";
import {db} from "../database/database.js";
import {createTask} from "../core/task.service.js";
import {walkFiles,safeTarget} from "../runtime/filesystem.service.js";
import {addClient,removeClient} from "../core/telemetry.js";
import {VERSION,AI_KEY,AI_MODEL,GITHUB_ENABLED,GITHUB_OWNER,GITHUB_VISIBILITY,WORKER_ID,now} from "../config/config.js";
export function createApp(){
 const app=express();
 app.use(express.json({limit:"5mb"}));
 app.use(express.static(path.resolve("public")));
 app.get("/api/health",(_req,res)=>{
  res.json({name:"Veylith",version:VERSION,status:"online",ai:{configured:Boolean(AI_KEY),model:AI_MODEL},github:{configured:GITHUB_ENABLED,owner:GITHUB_OWNER||null,visibility:GITHUB_VISIBILITY},worker:db.prepare("SELECT * FROM workers WHERE id=?").get(WORKER_ID),time:now()});
 });
 app.get("/api/dashboard",(_req,res)=>{
  const workers=db.prepare("SELECT * FROM workers ORDER BY heartbeat_at DESC").all();
  const projects=db.prepare("SELECT * FROM projects ORDER BY created_at DESC LIMIT 50").all();
  const tasks=db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100").all();
  const events=db.prepare("SELECT * FROM events ORDER BY id DESC LIMIT 150").all().reverse();
  const metrics=db.prepare("SELECT * FROM metrics ORDER BY id DESC LIMIT 120").all().reverse();
  const stats=db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) running,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed,SUM(repair_attempts) repairs FROM tasks`).get();
  res.json({version:VERSION,ai:{configured:Boolean(AI_KEY),model:AI_MODEL},github:{configured:GITHUB_ENABLED,owner:GITHUB_OWNER||null,visibility:GITHUB_VISIBILITY},workers,projects,tasks,events,metrics,stats});
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
 app.post("/api/tasks",(req,res)=>{
  const prompt=String(req.body?.prompt||"").trim();
  const name=String(req.body?.name||"").trim()||`Veylith Project ${Date.now()}`;
  if(prompt.length<5){res.status(400).json({error:"Development request is required."});return}
  if(!AI_KEY){res.status(409).json({error:"AI autonomous development is not configured.",required:"Set OPENAI_API_KEY in .env. The built-in demo remains available."});return}
  try{res.status(201).json(createTask(name,prompt))}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
 });
 app.post("/api/demo",(_req,res)=>{
  try{res.status(201).json(createTask(`Veylith Hello ${Date.now()}`,"[VEYLITH_DEMO] Create and test the autonomous Veylith hello API."))}
  catch(error){res.status(500).json({error:error instanceof Error?error.message:String(error)})}
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
  res.json({project,files:await walkFiles(project.workspace)});
 });
 app.get("/api/projects/:id/file",async(req,res)=>{
  const project=db.prepare("SELECT * FROM projects WHERE id=?").get(req.params.id) as any;
  if(!project){res.status(404).json({error:"Project not found."});return}
  try{
   const relative=String(req.query.path||"");
   res.json({path:relative,content:await readFile(safeTarget(project.workspace,relative),"utf8")});
  }catch(error){res.status(404).json({error:error instanceof Error?error.message:"File not found."})}
 });
 app.use((_req,res)=>res.sendFile(path.resolve("public/index.html")));
 return app;
}

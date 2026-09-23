import crypto from "node:crypto";
import {db} from "../database/database.js";
import {now} from "../config/config.js";
import {event,setPhase} from "../core/telemetry.js";
import type {DevelopmentPhase} from "./pipeline.types.js";

const progress:Record<DevelopmentPhase,number>={
 queued:0,
 architecture:10,
 planning:20,
 development:40,
 validation:65,
 review:78,
 repair:82,
 diagnosis:70,
 versioning:90,
 publishing:94,
 completed:100,
 failed:100
};

function makeId(){
 return `step_${crypto.randomUUID().replace(/-/g,"").slice(0,16)}`;
}

export function createStep(taskId:string,projectId:string,phase:DevelopmentPhase,agent:string,title:string,sequence:number,input?:unknown){
 const id=makeId();
 const time=now();
 db.prepare(`
 INSERT INTO development_steps(
  id,task_id,project_id,phase,agent,title,status,sequence,input,created_at,updated_at
 ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 `).run(
  id,
  taskId,
  projectId,
  phase,
  agent,
  title,
  "queued",
  sequence,
  input===undefined?null:JSON.stringify(input),
  time,
  time
 );
 event("step.created",title,{taskId,projectId,data:{stepId:id,phase,agent,sequence}});
 return id;
}

export function startStep(stepId:string,taskId:string,projectId:string,phase:DevelopmentPhase){
 const time=now();
 db.prepare("UPDATE development_steps SET status='running',started_at=?,updated_at=? WHERE id=?").run(time,time,stepId);
 setPhase(taskId,projectId,phase,progress[phase]);
 event("step.started",`${phase} started`,{taskId,projectId,data:{stepId,phase}});
}

export function completeStep(stepId:string,taskId:string,projectId:string,phase:DevelopmentPhase,output?:unknown){
 const time=now();
 db.prepare("UPDATE development_steps SET status='completed',output=?,completed_at=?,updated_at=? WHERE id=?").run(output===undefined?null:JSON.stringify(output),time,time,stepId);
 event("step.completed",`${phase} completed`,{taskId,projectId,data:{stepId,phase}});
}

export function failStep(stepId:string,taskId:string,projectId:string,phase:DevelopmentPhase,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 const time=now();
 db.prepare("UPDATE development_steps SET status='failed',error=?,completed_at=?,updated_at=? WHERE id=?").run(message,time,time,stepId);
 event("step.failed",`${phase}: ${message}`,{taskId,projectId,level:"error",data:{stepId,phase}});
}

export async function runStep<T>(
 taskId:string,
 projectId:string,
 phase:DevelopmentPhase,
 agent:string,
 title:string,
 sequence:number,
 action:()=>Promise<T>,
 input?:unknown
){
 const stepId=createStep(taskId,projectId,phase,agent,title,sequence,input);
 startStep(stepId,taskId,projectId,phase);
 try{
  const output=await action();
  completeStep(stepId,taskId,projectId,phase,output);
  return output;
 }catch(error){
  failStep(stepId,taskId,projectId,phase,error);
  throw error;
 }
}


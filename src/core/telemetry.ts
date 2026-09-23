import type {Response} from "express";
import os from "node:os";
import {db} from "../database/database.js";
import {WORKER_ID,now} from "../config/config.js";
const clients=new Set<Response>();
export function addClient(client:Response){clients.add(client)}
export function removeClient(client:Response){clients.delete(client)}
export function broadcast(channel:string,payload:unknown){
 const message=`data: ${JSON.stringify({channel,payload})}\n\n`;
 for(const client of clients)client.write(message);
}
export function event(type:string,message:string,options:{taskId?:string;projectId?:string;level?:string;data?:unknown}={}){
 const created=now();
 const result=db.prepare("INSERT INTO events(type,worker_id,project_id,task_id,level,message,data,created_at) VALUES(?,?,?,?,?,?,?,?)").run(type,WORKER_ID,options.projectId||null,options.taskId||null,options.level||"info",message,JSON.stringify(options.data||{}),created);
 const payload={id:Number(result.lastInsertRowid),type,worker_id:WORKER_ID,project_id:options.projectId||null,task_id:options.taskId||null,level:options.level||"info",message,data:options.data||{},created_at:created};
 broadcast("event",payload);
 return payload;
}
export function setWorker(status:string,phase:string,taskId:string|null=null,projectId:string|null=null){
 const time=now();
 db.prepare(`INSERT INTO workers(id,hostname,pid,status,phase,task_id,project_id,started_at,heartbeat_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,phase=excluded.phase,task_id=excluded.task_id,project_id=excluded.project_id,heartbeat_at=excluded.heartbeat_at`).run(WORKER_ID,os.hostname(),process.pid,status,phase,taskId,projectId,time,time);
 broadcast("worker",{id:WORKER_ID,status,phase,task_id:taskId,project_id:projectId,heartbeat_at:time});
}
export function setPhase(taskId:string,projectId:string,phase:string,progress:number){
 const time=now();
 db.prepare("UPDATE tasks SET phase=?,updated_at=? WHERE id=?").run(phase,time,taskId);
 db.prepare("UPDATE projects SET phase=?,progress=?,updated_at=? WHERE id=?").run(phase,progress,time,projectId);
 setWorker("busy",phase,taskId,projectId);
 broadcast("phase",{task_id:taskId,project_id:projectId,phase,progress,time});
}

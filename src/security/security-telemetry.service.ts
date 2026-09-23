import {event} from "../core/telemetry.js";

export function securityAllowed(action:string,taskId:string,projectId:string,data:any={}){
 event("security.allowed",action,{taskId,projectId,data});
}

export function securityRejected(action:string,error:unknown,taskId:string,projectId:string,data:any={}){
 const message=error instanceof Error?error.message:String(error);
 event("security.rejected",`${action}: ${message}`,{
  taskId,
  projectId,
  level:"error",
  data:{...data,error:message}
 });
}

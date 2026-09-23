import {WORKER_ID,now} from "../config/config.js";
import {RUNTIME_ID} from "../runtime/runtime-instance.service.js";
import {appendLog,cleanupLogs,levelRank} from "./log-storage.service.js";
import {redact} from "./log-redaction.service.js";
import type {LogContext,LogLevel,LogRecord} from "./logger.types.js";

const configured=(process.env.LOG_LEVEL||"info").toLowerCase() as LogLevel;
const MIN_LEVEL:["debug","info","warn","error","fatal"][number]=
 ["debug","info","warn","error","fatal"].includes(configured)?configured:"info";

let retentionChecked=false;

function normalizeError(error:unknown){
 if(!error)return undefined;
 if(error instanceof Error){
  const candidate=error as Error&{code?:string|number};
  return{
   name:error.name,
   message:error.message,
   stack:error.stack,
   code:candidate.code
  };
 }
 return{
  name:"Error",
  message:String(error)
 };
}

function write(level:LogLevel,message:string,context:LogContext={},data?:unknown,error?:unknown,eventName?:string){
 if(levelRank(level)<levelRank(MIN_LEVEL))return null;
 if(!retentionChecked){
  retentionChecked=true;
  try{cleanupLogs()}catch{}
 }
 const normalizedError=normalizeError(error);
 const record:LogRecord={
  timestamp:now(),
  level,
  message,
  event:eventName||null,
  runtimeId:context.runtimeId??RUNTIME_ID,
  workerId:context.workerId??WORKER_ID,
  jobId:context.jobId??null,
  taskId:context.taskId??null,
  projectId:context.projectId??null,
  phase:context.phase??null,
  component:context.component??null,
  operation:context.operation??null,
  data:redact(data),
  error:normalizedError?redact(normalizedError) as LogRecord["error"]:undefined
 };
 try{appendLog(record)}catch(storageError){
  console.error("Veylith log storage failure:",storageError);
 }
 const line=`[${record.timestamp}] ${level.toUpperCase()}${record.component?` [${record.component}]`:""} ${record.message}`;
 if(level==="error"||level==="fatal")console.error(line);
 else if(level==="warn")console.warn(line);
 else if(level==="debug"){
  if(process.env.LOG_CONSOLE_DEBUG==="true")console.debug(line);
 }else console.log(line);
 return record;
}

export const logger={
 debug:(message:string,context:LogContext={},data?:unknown)=>write("debug",message,context,data),
 info:(message:string,context:LogContext={},data?:unknown)=>write("info",message,context,data),
 warn:(message:string,context:LogContext={},data?:unknown)=>write("warn",message,context,data),
 error:(message:string,context:LogContext={},data?:unknown,error?:unknown)=>write("error",message,context,data,error),
 fatal:(message:string,context:LogContext={},data?:unknown,error?:unknown)=>write("fatal",message,context,data,error),
 event:(eventName:string,message:string,level:LogLevel="info",context:LogContext={},data?:unknown)=>write(level,message,context,data,undefined,eventName)
};

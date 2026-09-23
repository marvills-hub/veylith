import fs from "node:fs";
import path from "node:path";
import {now} from "../config/config.js";
import type {LogLevel,LogRecord} from "./logger.types.js";

const LOG_ROOT=path.resolve(process.env.LOG_ROOT||"./logs");
const MAX_FILE_BYTES=Math.max(
 1024*1024,
 Number(process.env.LOG_MAX_FILE_BYTES||10*1024*1024)
);
const RETENTION_DAYS=Math.max(
 1,
 Number(process.env.LOG_RETENTION_DAYS||14)
);

let initialized=false;
let activeDate="";
let activePath="";

function dateKey(){
 return new Date().toISOString().slice(0,10);
}

function ensureRoot(){
 if(initialized)return;
 fs.mkdirSync(LOG_ROOT,{recursive:true});
 initialized=true;
}

function logPath(){
 ensureRoot();
 const date=dateKey();
 if(date!==activeDate){
  activeDate=date;
  activePath=path.join(LOG_ROOT,`veylith-${date}.jsonl`);
 }
 if(fs.existsSync(activePath)){
  const size=fs.statSync(activePath).size;
  if(size>=MAX_FILE_BYTES){
   let index=1;
   let candidate="";
   do{
    candidate=path.join(LOG_ROOT,`veylith-${date}.${index}.jsonl`);
    index++;
   }while(fs.existsSync(candidate)&&fs.statSync(candidate).size>=MAX_FILE_BYTES);
   activePath=candidate;
  }
 }
 return activePath;
}

export function appendLog(record:LogRecord){
 const target=logPath();
 fs.appendFileSync(target,`${JSON.stringify(record)}\n`,"utf8");
 return target;
}

export function cleanupLogs(){
 ensureRoot();
 const cutoff=Date.now()-RETENTION_DAYS*86400000;
 let removed=0;
 for(const entry of fs.readdirSync(LOG_ROOT,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.endsWith(".jsonl"))continue;
  const target=path.join(LOG_ROOT,entry.name);
  try{
   if(fs.statSync(target).mtimeMs<cutoff){
    fs.unlinkSync(target);
    removed++;
   }
  }catch{}
 }
 return removed;
}

export function logFiles(){
 ensureRoot();
 return fs.readdirSync(LOG_ROOT,{withFileTypes:true})
  .filter(entry=>entry.isFile()&&entry.name.endsWith(".jsonl"))
  .map(entry=>{
   const target=path.join(LOG_ROOT,entry.name);
   const stat=fs.statSync(target);
   return{
    name:entry.name,
    path:target,
    size:stat.size,
    modifiedAt:stat.mtime.toISOString()
   };
  })
  .sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
}

export function logStorageStatus(){
 ensureRoot();
 const files=logFiles();
 return{
  root:LOG_ROOT,
  files:files.length,
  bytes:files.reduce((sum,file)=>sum+file.size,0),
  retentionDays:RETENTION_DAYS,
  maxFileBytes:MAX_FILE_BYTES,
  checkedAt:now()
 };
}

export function levelRank(level:LogLevel){
 return({debug:10,info:20,warn:30,error:40,fatal:50})[level];
}

import fs from "node:fs";
import {logFiles} from "./log-storage.service.js";
import type {LogQuery,LogRecord} from "./logger.types.js";

function matches(record:LogRecord,query:LogQuery){
 if(query.level&&record.level!==query.level)return false;
 if(query.component&&record.component!==query.component)return false;
 if(query.taskId&&record.taskId!==query.taskId)return false;
 if(query.projectId&&record.projectId!==query.projectId)return false;
 if(query.jobId&&record.jobId!==query.jobId)return false;
 if(query.runtimeId&&record.runtimeId!==query.runtimeId)return false;
 if(query.search){
  const text=JSON.stringify(record).toLowerCase();
  if(!text.includes(query.search.toLowerCase()))return false;
 }
 return true;
}

export function queryLogs(query:LogQuery={}){
 const limit=Math.min(1000,Math.max(1,query.limit||200));
 const output:LogRecord[]=[];
 for(const file of logFiles()){
  let content="";
  try{content=fs.readFileSync(file.path,"utf8")}catch{continue}
  const lines=content.split(/\r?\n/).filter(Boolean).reverse();
  for(const line of lines){
   try{
    const record=JSON.parse(line) as LogRecord;
    if(matches(record,query))output.push(record);
    if(output.length>=limit)return output;
   }catch{}
  }
 }
 return output;
}

export function logStats(){
 const records=queryLogs({limit:1000});
 const levels:Record<string,number>={debug:0,info:0,warn:0,error:0,fatal:0};
 const components:Record<string,number>={};
 for(const record of records){
  levels[record.level]=(levels[record.level]||0)+1;
  const component=record.component||"unknown";
  components[component]=(components[component]||0)+1;
 }
 return{
  sampled:records.length,
  levels,
  components,
  newest:records[0]?.timestamp||null,
  oldest:records.at(-1)?.timestamp||null
 };
}

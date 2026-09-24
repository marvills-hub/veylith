import {event} from "../../core/telemetry.js";
type Waiter={
 resolve:(release:()=>void)=>void;
 taskId:string;
 projectId:string;
 provider:string;
 queuedAt:number;
};
let active=0;
const queue:Waiter[]=[];
function configuredConcurrency(){
 const value=Number(process.env.AI_REQUEST_CONCURRENCY||1);
 return Number.isFinite(value)?Math.max(1,Math.floor(value)):1;
}
function release(){
 active=Math.max(0,active-1);
 drain();
}
function drain(){
 const limit=configuredConcurrency();
 while(active<limit&&queue.length){
  const waiter=queue.shift()!;
  active++;
  event("ai.gate.acquired","AI request acquired provider execution slot",{
   taskId:waiter.taskId,
   projectId:waiter.projectId,
   data:{
    provider:waiter.provider,
    active,
    concurrency:limit,
    queued:queue.length,
    waitedMs:Date.now()-waiter.queuedAt
   }
  });
  let released=false;
  waiter.resolve(()=>{
   if(released)return;
   released=true;
   release();
  });
 }
}
export async function acquireAIRequestSlot(taskId:string,projectId:string,provider:string){
 const limit=configuredConcurrency();
 if(active<limit){
  active++;
  event("ai.gate.acquired","AI request acquired provider execution slot",{
   taskId,
   projectId,
   data:{provider,active,concurrency:limit,queued:queue.length,waitedMs:0}
  });
  let released=false;
  return()=>{
   if(released)return;
   released=true;
   release();
  };
 }
 event("ai.gate.queued","AI request queued behind provider concurrency gate",{
  taskId,
  projectId,
  data:{provider,active,concurrency:limit,queued:queue.length+1}
 });
 return await new Promise<()=>void>(resolve=>{
  queue.push({resolve,taskId,projectId,provider,queuedAt:Date.now()});
  drain();
 });
}
export function aiRequestGateStatus(){
 return{
  active,
  queued:queue.length,
  concurrency:configuredConcurrency()
 };
}
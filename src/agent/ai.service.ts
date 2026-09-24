import {getAIProvider} from "./provider.service.js";
import {acquireAIRequestSlot} from "./runtime/ai-request-gate.service.js";
export async function aiJSON(system:string,prompt:string,taskId:string,projectId:string){
 const provider=getAIProvider();
 const release=await acquireAIRequestSlot(taskId,projectId,provider.name);
 try{
  return await provider.json(system,prompt,taskId,projectId);
 }finally{
  release();
 }
}
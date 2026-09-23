import {getAIProvider} from "./provider.service.js";
export async function aiJSON(system:string,prompt:string,taskId:string,projectId:string){
 const provider=getAIProvider();
 return await provider.json(system,prompt,taskId,projectId);
}

import {AI_KEY,AI_MODEL} from "../config/config.js";
import {event} from "../core/telemetry.js";
function extractResponseText(body:any){
 if(typeof body.output_text==="string"&&body.output_text.trim())return body.output_text;
 const text:string[]=[];
 for(const output of body.output||[])for(const content of output.content||[])if(typeof content.text==="string")text.push(content.text);
 return text.join("\n");
}
export async function aiJSON(system:string,prompt:string,taskId:string,projectId:string){
 if(!AI_KEY)throw new Error("OPENAI_API_KEY is required for autonomous development tasks.");
 event("ai.request",`Calling ${AI_MODEL}`,{taskId,projectId});
 const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${AI_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:AI_MODEL,instructions:system,input:prompt})});
 if(!response.ok)throw new Error(`AI ${response.status}: ${(await response.text()).slice(0,2000)}`);
 const body:any=await response.json();
 const raw=extractResponseText(body).replace(/^```json\s*/i,"").replace(/```$/,"").trim();
 if(!raw)throw new Error("AI returned an empty response.");
 try{
  const parsed=JSON.parse(raw);
  event("ai.response","AI response received",{taskId,projectId});
  return parsed;
 }catch{throw new Error(`AI returned invalid JSON: ${raw.slice(0,1000)}`)}
}

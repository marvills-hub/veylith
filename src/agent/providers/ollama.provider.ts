import {OLLAMA_MODEL,OLLAMA_URL} from "../../config/config.js";
import {event} from "../../core/telemetry.js";
import {AIProviderError} from "../../core/ai-error.service.js";
import type {AIProvider,AIProviderStatus} from "./provider.types.js";
import {parseAIJSON} from "../ai-json.service.js";
export class OllamaProvider implements AIProvider{
 readonly name="ollama";
 readonly local=true;
 get model(){return OLLAMA_MODEL}
 get endpoint(){return OLLAMA_URL}
 get configured(){return Boolean(OLLAMA_MODEL&&OLLAMA_URL)}
 async health():Promise<AIProviderStatus>{
  let available=false;
  try{
   const response=await fetch(`${this.endpoint}/api/tags`,{signal:AbortSignal.timeout(2500)});
   if(response.ok){
    const body:any=await response.json();
    available=Array.isArray(body.models)&&body.models.some((item:any)=>{
     const name=String(item.name||item.model||"");
     return name===this.model||name.split(":")[0]===this.model.split(":")[0];
    });
   }
  }catch{}
  return{name:this.name,model:this.model,configured:this.configured&&available,local:this.local,endpoint:this.endpoint};
 }
 async json<T=any>(system:string,prompt:string,taskId:string,projectId:string):Promise<T>{
  if(!this.configured)throw new AIProviderError("Ollama provider is not configured.",{provider:this.name,code:"not_configured",retryable:false});
  event("ai.request",`Calling Ollama ${this.model}`,{taskId:taskId,projectId:projectId,data:{provider:this.name,model:this.model}});
  let response:Response;
  try{
   response=await fetch(`${this.endpoint}/api/chat`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({
     model:this.model,
     stream:false,
     format:"json",
     messages:[
      {role:"system",content:system},
      {role:"user",content:prompt}
     ],
     options:{temperature:0.1}
    })
   });
  }catch(error){
   throw new AIProviderError(`Ollama connection failed: ${error instanceof Error?error.message:String(error)}`,{provider:this.name,retryable:true});
  }
  if(!response.ok){
   const body=await response.text();
   const permanent=[400,401,403,404,422].includes(response.status);
   throw new AIProviderError(`Ollama ${response.status}: ${body.slice(0,1800)}`,{provider:this.name,status:response.status,retryable:!permanent});
  }
  const body:any=await response.json();
  const raw=String(body?.message?.content||body?.response||"");
  const parsed=parseAIJSON(raw,this.name);
  event("ai.response","Ollama response received",{taskId:taskId,projectId:projectId,data:{provider:this.name,model:this.model}});
  return parsed as T;
 }
}




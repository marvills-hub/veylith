import {AI_KEY,OPENAI_MODEL} from "../../config/config.js";
import {event} from "../../core/telemetry.js";
import {AIProviderError,providerHTTPError} from "../../core/ai-error.service.js";
import type {AIProvider,AIProviderStatus} from "./provider.types.js";
import {parseAIJSON} from "../ai-json.service.js";
function extractResponseText(body:any){
 if(typeof body.output_text==="string"&&body.output_text.trim())return body.output_text;
 const text:string[]=[];
 for(const output of body.output||[]){
  for(const content of output.content||[]){
   if(typeof content.text==="string")text.push(content.text);
  }
 }
 return text.join("\n");
}
export class OpenAIProvider implements AIProvider{
 readonly name="openai";
 readonly local=false;
 readonly endpoint="https://api.openai.com/v1/responses";
 get model(){return OPENAI_MODEL}
 get configured(){return Boolean(AI_KEY)}
 async health():Promise<AIProviderStatus>{
  return{name:this.name,model:this.model,configured:this.configured,local:this.local,endpoint:this.endpoint};
 }
 async json<T=any>(system:string,prompt:string,taskId:string,projectId:string):Promise<T>{
  if(!AI_KEY)throw new AIProviderError("OPENAI_API_KEY is not configured.",{provider:this.name,code:"missing_api_key",retryable:false});
  event("ai.request",`Calling OpenAI ${this.model}`,{taskId:taskId,projectId:projectId,data:{provider:this.name,model:this.model}});
  let response:Response;
  try{
   response=await fetch(this.endpoint,{method:"POST",headers:{Authorization:`Bearer ${AI_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:this.model,instructions:system,input:prompt})});
  }catch(error){
   throw new AIProviderError(`OpenAI connection failed: ${error instanceof Error?error.message:String(error)}`,{provider:this.name,retryable:true});
  }
  if(!response.ok)throw providerHTTPError(this.name,response.status,await response.text());
  const body:any=await response.json();
  const parsed=parseAIJSON(extractResponseText(body),this.name);
  event("ai.response","OpenAI response received",{taskId:taskId,projectId:projectId,data:{provider:this.name,model:this.model}});
  return parsed as T;
 }
}



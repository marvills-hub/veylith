import {
 OLLAMA_API_KEY,
 OLLAMA_CLOUD_MODEL,
 OLLAMA_CLOUD_URL,
 AI_REQUEST_TIMEOUT_MS,
 AI_REQUEST_MAX_ATTEMPTS,
 AI_RETRY_BASE_DELAY_MS,
 AI_HEALTH_TIMEOUT_MS
} from "../../config/config.js";
import {event} from "../../core/telemetry.js";
import {AIProviderError} from "../../core/ai-error.service.js";
import {
 providerRequestAllowed,
 providerCircuitStatus,
 recordProviderFailure,
 recordProviderSuccess
} from "../../core/provider-circuit.service.js";
import type {AIProvider,AIProviderStatus} from "./provider.types.js";
import {parseAIJSON} from "../ai-json.service.js";

function wait(ms:number){
 return new Promise(resolve=>setTimeout(resolve,ms));
}

function errorMessage(error:unknown){
 return error instanceof Error?error.message:String(error);
}

function isTimeout(error:unknown){
 if(!(error instanceof Error))return false;
 return error.name==="TimeoutError"||
  error.name==="AbortError"||
  /timeout|timed out|aborted/i.test(error.message);
}

export class OllamaCloudProvider implements AIProvider{
 readonly name="ollama-cloud";
 readonly local=false;

 get model(){
  return OLLAMA_CLOUD_MODEL;
 }

 get endpoint(){
  return OLLAMA_CLOUD_URL;
 }

 get configured(){
  return Boolean(
   OLLAMA_API_KEY&&
   OLLAMA_CLOUD_MODEL&&
   OLLAMA_CLOUD_URL
  );
 }

 private headers(){
  return{
   Authorization:`Bearer ${OLLAMA_API_KEY}`,
   "Content-Type":"application/json"
  };
 }

 private async request(body:unknown,timeout:number){
  return fetch(`${this.endpoint}/api/chat`,{
   method:"POST",
   headers:this.headers(),
   signal:AbortSignal.timeout(timeout),
   body:JSON.stringify(body)
  });
 }

 async health():Promise<AIProviderStatus>{
  if(!this.configured){
   return{
    name:this.name,
    model:this.model,
    configured:false,
    local:this.local,
    endpoint:this.endpoint
   };
  }

  const circuit=providerCircuitStatus(this.name);

  if(circuit.state==="open"){
   return{
    name:this.name,
    model:this.model,
    configured:false,
    local:this.local,
    endpoint:this.endpoint
   };
  }

  try{
   const response=await this.request({
    model:this.model,
    stream:false,
    format:"json",
    messages:[
     {
      role:"user",
      content:'Return exactly this JSON object: {"ok":true}'
     }
    ],
    options:{temperature:0}
   },AI_HEALTH_TIMEOUT_MS);

   if(response.ok){
    recordProviderSuccess(this.name);

    return{
     name:this.name,
     model:this.model,
     configured:true,
     local:this.local,
     endpoint:this.endpoint
    };
   }

   const error=new Error(
    `Ollama Cloud health returned ${response.status}`
   );

   recordProviderFailure(this.name,error);

   return{
    name:this.name,
    model:this.model,
    configured:false,
    local:this.local,
    endpoint:this.endpoint
   };
  }catch(error){
   recordProviderFailure(this.name,error);

   return{
    name:this.name,
    model:this.model,
    configured:false,
    local:this.local,
    endpoint:this.endpoint
   };
  }
 }

 async json<T=any>(
  system:string,
  prompt:string,
  taskId:string,
  projectId:string
 ):Promise<T>{
  if(!OLLAMA_API_KEY){
   throw new AIProviderError(
    "OLLAMA_API_KEY is not configured.",
    {
     provider:this.name,
     code:"missing_api_key",
     retryable:false
    }
   );
  }

  const circuit=providerCircuitStatus(this.name);

  if(!providerRequestAllowed(this.name)){
   throw new AIProviderError(
    `Ollama Cloud circuit is open until ${
     circuit.retryAt
      ?new Date(circuit.retryAt).toISOString()
      :"provider recovery"
    }.`,
    {
     provider:this.name,
     code:"circuit_open",
     retryable:true
    }
   );
  }

  let lastError:unknown;

  for(
   let attempt=1;
   attempt<=AI_REQUEST_MAX_ATTEMPTS;
   attempt++
  ){
   const started=Date.now();

   event(
    "ai.request",
    `Calling Ollama Cloud ${this.model}`,
    {
     taskId,
     projectId,
     data:{
      provider:this.name,
      model:this.model,
      attempt,
      maxAttempts:AI_REQUEST_MAX_ATTEMPTS,
      timeoutMs:AI_REQUEST_TIMEOUT_MS,
      circuit:providerCircuitStatus(this.name).state
     }
    }
   );

   try{
    const response=await this.request({
     model:this.model,
     stream:false,
     format:"json",
     messages:[
      {role:"system",content:system},
      {role:"user",content:prompt}
     ],
     options:{temperature:0.1}
    },AI_REQUEST_TIMEOUT_MS);

    const elapsedMs=Date.now()-started;

    if(!response.ok){
     const body=await response.text();
     const permanent=[
      400,
      401,
      402,
      403,
      404,
      410,
      422
     ].includes(response.status);

     const error=new AIProviderError(
      `Ollama Cloud ${response.status}: ${body.slice(0,1800)}`,
      {
       provider:this.name,
       status:response.status,
       retryable:!permanent
      }
     );

     if(!permanent)recordProviderFailure(this.name,error);

     event(
      permanent?"ai.failed":"ai.retry",
      `Ollama Cloud returned HTTP ${response.status}`,
      {
       taskId,
       projectId,
       level:permanent?"error":"warn",
       data:{
        provider:this.name,
        model:this.model,
        attempt,
        maxAttempts:AI_REQUEST_MAX_ATTEMPTS,
        status:response.status,
        elapsedMs
       }
      }
     );

     if(permanent)throw error;
     lastError=error;
    }else{
     let body:any;

     try{
      body=await response.json();
     }catch(error){
      const wrapped=new AIProviderError(
       `Ollama Cloud returned an unreadable response: ${errorMessage(error)}`,
       {
        provider:this.name,
        retryable:true
       }
      );

      recordProviderFailure(this.name,wrapped);
      throw wrapped;
     }

     const raw=String(
      body?.message?.content||
      body?.response||
      ""
     );

     const parsed=parseAIJSON(raw,this.name);

     recordProviderSuccess(this.name);

     event(
      "ai.response",
      "Ollama Cloud response received",
      {
       taskId,
       projectId,
       data:{
        provider:this.name,
        model:this.model,
        attempt,
        elapsedMs,
        circuit:providerCircuitStatus(this.name).state
       }
      }
     );

     return parsed as T;
    }
   }catch(error){
    if(
     error instanceof AIProviderError&&
     !error.retryable
    ){
     throw error;
    }

    const elapsedMs=Date.now()-started;
    const timeout=isTimeout(error);

    lastError=error;

    if(!(error instanceof AIProviderError)){
     recordProviderFailure(this.name,error);
    }

    const circuitAfterFailure=providerCircuitStatus(this.name);

    event(
     "ai.retry",
     timeout
      ?`Ollama Cloud request timed out after ${elapsedMs}ms`
      :"Ollama Cloud connection failed; retrying",
     {
      taskId,
      projectId,
      level:"warn",
      data:{
       provider:this.name,
       model:this.model,
       attempt,
       maxAttempts:AI_REQUEST_MAX_ATTEMPTS,
       elapsedMs,
       timeout,
       circuit:circuitAfterFailure.state,
       retryAt:circuitAfterFailure.retryAt
        ?new Date(circuitAfterFailure.retryAt).toISOString()
        :null,
       error:errorMessage(error)
      }
     }
    );
   }

   if(
    providerCircuitStatus(this.name).state==="open"
   ){
    break;
   }

   if(attempt<AI_REQUEST_MAX_ATTEMPTS){
    await wait(AI_RETRY_BASE_DELAY_MS*attempt);
   }
  }

  const state=providerCircuitStatus(this.name);

  throw new AIProviderError(
   state.state==="open"
    ?`Ollama Cloud circuit opened after repeated failures. Retry after ${
      state.retryAt
       ?new Date(state.retryAt).toISOString()
       :"cooldown"
     }.`
    :`Ollama Cloud unavailable after ${AI_REQUEST_MAX_ATTEMPTS} attempts: ${errorMessage(lastError||"unknown error")}`,
   {
    provider:this.name,
    code:state.state==="open"
     ?"circuit_open"
     :"provider_unavailable",
    retryable:true
   }
  );
 }
}


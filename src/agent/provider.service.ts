import {AI_KEY,AI_MODEL} from "../config/config.js";
import {aiJSON} from "./ai.service.js";

export interface AIProvider{
 readonly name:string;
 readonly model:string;
 readonly configured:boolean;
 json<T=any>(system:string,prompt:string,taskId:string,projectId:string):Promise<T>;
}

class OpenAIProvider implements AIProvider{
 readonly name="openai";
 get model(){return AI_MODEL}
 get configured(){return Boolean(AI_KEY)}
 async json<T=any>(system:string,prompt:string,taskId:string,projectId:string){
  return await aiJSON(system,prompt,taskId,projectId) as T;
 }
}

const providers:Record<string,AIProvider>={
 openai:new OpenAIProvider()
};

export function getAIProvider(name=process.env.AI_PROVIDER||"openai"){
 const provider=providers[name.toLowerCase()];
 if(!provider)throw new Error(`Unknown AI provider: ${name}`);
 return provider;
}

export function aiProviderStatus(){
 const provider=getAIProvider();
 return{
  provider:provider.name,
  model:provider.model,
  configured:provider.configured
 };
}

import {AI_PROVIDER} from "../config/config.js";
import {OpenAIProvider} from "./providers/openai.provider.js";
import {OllamaProvider} from "./providers/ollama.provider.js";
import {OllamaCloudProvider} from "./providers/ollama-cloud.provider.js";
import type {AIProvider} from "./providers/provider.types.js";
const providers:Record<string,AIProvider>={
 openai:new OpenAIProvider(),
 ollama:new OllamaProvider(),
 "ollama-cloud":new OllamaCloudProvider()
};
export function getAIProvider(name=AI_PROVIDER){
 const provider=providers[name.toLowerCase()];
 if(!provider)throw new Error(`Unknown AI provider "${name}". Available providers: ${Object.keys(providers).join(", ")}.`);
 return provider;
}
export function aiProviderStatus(){
 const provider=getAIProvider();
 return{
  provider:provider.name,
  model:provider.model,
  configured:provider.configured,
  local:provider.local,
  endpoint:provider.endpoint
 };
}
export async function aiProviderHealth(){
 const provider=getAIProvider();
 return await provider.health();
}
export function availableAIProviders(){
 return Object.values(providers).map(provider=>({
  provider:provider.name,
  model:provider.model,
  configured:provider.configured,
  local:provider.local,
  endpoint:provider.endpoint
 }));
}

import {AIProviderError} from "../core/ai-error.service.js";

function extractBalancedJSON(text:string){
 const starts:number[]=[];
 for(let i=0;i<text.length;i++){
  if(text[i]==="{"||text[i]==="[")starts.push(i);
 }
 for(const start of starts){
  const open=text[start];
  const close=open==="{"?"}":"]";
  let depth=0;
  let inString=false;
  let escaped=false;
  for(let i=start;i<text.length;i++){
   const char=text[i];
   if(inString){
    if(escaped){
     escaped=false;
     continue;
    }
    if(char==="\\"){
     escaped=true;
     continue;
    }
    if(char==='"')inString=false;
    continue;
   }
   if(char==='"'){
    inString=true;
    continue;
   }
   if(char===open)depth++;
   else if(char===close){
    depth--;
    if(depth===0){
     const candidate=text.slice(start,i+1);
     try{
      JSON.parse(candidate);
      return candidate;
     }catch{
      break;
     }
    }
   }
  }
 }
 return null;
}

export function parseAIJSON(raw:string,provider:string){
 const cleaned=String(raw||"").trim();
 if(!cleaned){
  throw new AIProviderError(`${provider} returned an empty response.`,{
   provider,
   retryable:true
  });
 }
 const candidates:string[]=[cleaned];
 const fenced=[...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
 for(const match of fenced){
  if(match[1]?.trim())candidates.push(match[1].trim());
 }
 const balanced=extractBalancedJSON(cleaned);
 if(balanced)candidates.push(balanced);
 for(const candidate of candidates){
  const normalized=candidate
   .replace(/^```(?:json)?\s*/i,"")
   .replace(/\s*```$/,"")
   .trim();
  try{
   return JSON.parse(normalized);
  }catch{}
 }
 throw new AIProviderError(
  `${provider} returned invalid JSON: ${cleaned.slice(0,1500)}`,
  {
   provider,
   retryable:true
  }
 );
}

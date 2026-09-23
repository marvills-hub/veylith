export const DEFAULT_CONTEXT_BUDGET=60000;
export const MAX_CONTEXT_FILE_CHARS=16000;

export function contextBudget(requested?:number){
 const value=Number(requested||DEFAULT_CONTEXT_BUDGET);
 return Math.max(8000,Math.min(120000,Number.isFinite(value)?Math.floor(value):DEFAULT_CONTEXT_BUDGET));
}
export function fitContent(content:string,remaining:number){
 const allowed=Math.max(0,Math.min(MAX_CONTEXT_FILE_CHARS,remaining));
 if(content.length<=allowed)return{content,includedChars:content.length,truncated:false};
 if(allowed<=0)return{content:"",includedChars:0,truncated:true};
 return{content:content.slice(0,allowed),includedChars:allowed,truncated:true};
}

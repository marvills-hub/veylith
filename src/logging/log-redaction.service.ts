const SECRET_KEYS=[
 "password","passwd","secret","token","authorization","cookie",
 "api_key","apikey","api-key","access_token","refresh_token",
 "github_token","openai_api_key","ollama_api_key","private_key"
];

function secretKey(key:string){
 const normalized=key.toLowerCase().replace(/[^a-z0-9_-]/g,"");
 return SECRET_KEYS.some(secret=>normalized.includes(secret));
}

function redactString(value:string){
 let result=value;
 result=result.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi,"Bearer [REDACTED]");
 result=result.replace(/gh[pousr]_[A-Za-z0-9_]+/g,"[REDACTED]");
 result=result.replace(/sk-[A-Za-z0-9_-]{12,}/g,"[REDACTED]");
 return result;
}

export function redact(value:unknown,depth=0):unknown{
 if(depth>8)return "[MAX_DEPTH]";
 if(value===null||value===undefined)return value;
 if(typeof value==="string")return redactString(value);
 if(typeof value==="number"||typeof value==="boolean")return value;
 if(value instanceof Error){
  return{
   name:value.name,
   message:redactString(value.message),
   stack:value.stack?redactString(value.stack):undefined
  };
 }
 if(Array.isArray(value))return value.map(item=>redact(item,depth+1));
 if(typeof value==="object"){
  const output:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
   output[key]=secretKey(key)?"[REDACTED]":redact(item,depth+1);
  }
  return output;
 }
 return String(value);
}

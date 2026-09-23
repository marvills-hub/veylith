export class AIProviderError extends Error{
 readonly provider:string;
 readonly status:number|null;
 readonly code:string|null;
 readonly retryable:boolean;
 constructor(message:string,options:{provider:string,status?:number|null,code?:string|null,retryable?:boolean}){
  super(message);
  this.name="AIProviderError";
  this.provider=options.provider;
  this.status=options.status??null;
  this.code=options.code??null;
  this.retryable=options.retryable??false;
 }
}
const permanentCodes=new Set([
 "insufficient_quota",
 "credit_balance_exhausted",
 "invalid_api_key",
 "invalid_api_key_error",
 "authentication_error",
 "permission_denied",
 "model_not_found",
 "billing_not_active",
 "account_deactivated"
]);
export function isRetryableStatus(status:number){
 return status===408||status===409||status===425||status===429||status>=500;
}
export function providerHTTPError(provider:string,status:number,body:string){
 let code:string|null=null;
 let message=body;
 try{
  const parsed=JSON.parse(body);
  code=parsed?.error?.code||parsed?.code||null;
  message=parsed?.error?.message||parsed?.message||body;
 }catch{}
 const permanent=Boolean(code&&permanentCodes.has(String(code).toLowerCase()));
 return new AIProviderError(`${provider} ${status}: ${message.slice(0,1800)}`,{
  provider,
  status,
  code,
  retryable:!permanent&&isRetryableStatus(status)
 });
}
export function isRetryableAIError(error:unknown){
 if(error instanceof AIProviderError)return error.retryable;
 if(error instanceof TypeError)return true;
 const message=error instanceof Error?error.message:String(error);
 return /timeout|timed out|ECONNRESET|ECONNREFUSED|ENETUNREACH|EAI_AGAIN|fetch failed/i.test(message);
}
export function isPermanentAIError(error:unknown){
 return error instanceof AIProviderError&&!error.retryable;
}

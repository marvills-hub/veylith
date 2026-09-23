import {AIProviderError,isPermanentAIError,isRetryableAIError} from "../core/ai-error.service.js";
import {TaskControlError} from "../core/task-control.service.js";

export type JobFailureKind=
 "control_cancel"|
 "control_pause"|
 "provider_retryable"|
 "provider_permanent"|
 "execution_retryable";

export interface JobFailureClassification{
 kind:JobFailureKind;
 consumeAttempt:boolean;
 retryable:boolean;
 terminal:boolean;
 pause:boolean;
 cancel:boolean;
 reason:string;
}

function message(error:unknown){
 return error instanceof Error?error.message:String(error);
}

export function classifyJobFailure(error:unknown,task?:any):JobFailureClassification{
 if(error instanceof TaskControlError){
  if(error.action==="cancel")return{
   kind:"control_cancel",
   consumeAttempt:false,
   retryable:false,
   terminal:true,
   pause:false,
   cancel:true,
   reason:message(error)
  };
  return{
   kind:"control_pause",
   consumeAttempt:false,
   retryable:false,
   terminal:false,
   pause:true,
   cancel:false,
   reason:message(error)
  };
 }
 if(task?.status==="cancelled")return{
  kind:"control_cancel",
  consumeAttempt:false,
  retryable:false,
  terminal:true,
  pause:false,
  cancel:true,
  reason:"Task cancelled"
 };
 if(task?.status==="paused")return{
  kind:"control_pause",
  consumeAttempt:false,
  retryable:false,
  terminal:false,
  pause:true,
  cancel:false,
  reason:"Task paused"
 };
 if(error instanceof AIProviderError||isRetryableAIError(error)||isPermanentAIError(error)){
  if(isPermanentAIError(error))return{
   kind:"provider_permanent",
   consumeAttempt:false,
   retryable:false,
   terminal:true,
   pause:false,
   cancel:false,
   reason:message(error)
  };
  return{
   kind:"provider_retryable",
   consumeAttempt:false,
   retryable:true,
   terminal:false,
   pause:true,
   cancel:false,
   reason:message(error)
  };
 }
 return{
  kind:"execution_retryable",
  consumeAttempt:true,
  retryable:true,
  terminal:false,
  pause:false,
  cancel:false,
  reason:message(error)
 };
}


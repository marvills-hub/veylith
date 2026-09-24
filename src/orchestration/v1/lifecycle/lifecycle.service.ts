import{
 ensureLifecycleCheckpoint,
 lifecycleCheckpoint,
 updateLifecycleCheckpoint
}from"./lifecycle.repository.js";

export function beginAutonomousLifecycle(input:{
 projectId:string;
 goalId:string;
 taskId?:string|null;
 workItemId?:string|null;
}){
 const checkpoint=ensureLifecycleCheckpoint({
  ...input,
  stage:"development"
 });
 if(checkpoint.status==="completed")return checkpoint;
 if(checkpoint.status==="failed"||checkpoint.status==="waiting"){
  return updateLifecycleCheckpoint(input.goalId,{
   stage:"development",
   status:"running",
   taskId:input.taskId??checkpoint.taskId,
   workItemId:input.workItemId??checkpoint.workItemId,
   error:null,
   completed:false,
   metadata:{
    ...checkpoint.metadata,
    resumedAt:new Date().toISOString()
   }
  });
 }
 return checkpoint;
}

export function checkpointAutonomousLifecycle(
 goalId:string,
 stage:any,
 input:Record<string,any>={}
){
 return updateLifecycleCheckpoint(goalId,{
  ...input,
  stage,
  status:stage==="completed"?"completed":input.status??"running",
  error:null,
  completed:stage==="completed"
 });
}

export function waitAutonomousLifecycle(goalId:string,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return updateLifecycleCheckpoint(goalId,{
  status:"waiting",
  error:message
 });
}

export function failAutonomousLifecycle(goalId:string,error:unknown){
 const message=error instanceof Error?error.message:String(error);
 return updateLifecycleCheckpoint(goalId,{
  status:"failed",
  error:message
 });
}

export function autonomousLifecycleState(goalId:string){
 return lifecycleCheckpoint(goalId);
}




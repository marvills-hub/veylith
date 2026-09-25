import{listRecoverableLifecycles,updateLifecycleCheckpoint}from"./lifecycle.repository.js";
import{goalExecutionState,synchronizeGoalExecution}from"../../../team/goal-team-execution.service.js";
import{recoverDevelopmentSession}from"../../../development/development-session.service.js";
import{getDeliveryPlan,latestDeliveryPlan,setDeliveryPlanStatus}from"../../../delivery/delivery-plan.repository.js";
import{findDeliveryPublicationByPlan}from"../../../delivery/delivery-publication.repository.js";
import{deliveryVerificationForPlan}from"../../../delivery/delivery-verification.service.js";
import{findReleaseByPlan}from"../../../delivery/release-history.repository.js";
import{event}from"../../../core/telemetry.js";
import type{AutonomousLifecycleCheckpoint,AutonomousLifecycleStage,AutonomousLifecycleStatus}from"./lifecycle.types.js";

function graphComplete(state:ReturnType<typeof goalExecutionState>){
 return state.total>0&&state.completed===state.total;
}

function deliveryPlanForLifecycle(lifecycle:AutonomousLifecycleCheckpoint){
 if(lifecycle.deliveryPlanId){
  const exact=getDeliveryPlan(lifecycle.deliveryPlanId);
  if(exact&&exact.projectId===lifecycle.projectId&&exact.goalId===lifecycle.goalId){
   return exact;
  }
 }
 const latest=latestDeliveryPlan(lifecycle.projectId);
 if(latest&&latest.goalId===lifecycle.goalId)return latest;
 return null;
}

function recoveryState(
 lifecycle:AutonomousLifecycleCheckpoint,
 state:ReturnType<typeof goalExecutionState>
){
 const plan=deliveryPlanForLifecycle(lifecycle);
 if(!plan){
  if(!graphComplete(state)){
   return{
    stage:lifecycle.stage,
    status:"running" as AutonomousLifecycleStatus,
    completed:false,
    deliveryPlanId:null,
    publicationId:null,
    verificationId:null,
    releaseId:null
   };
  }
  return{
   stage:"delivery" as AutonomousLifecycleStage,
   status:"waiting" as AutonomousLifecycleStatus,
   completed:false,
   deliveryPlanId:null,
   publicationId:null,
   verificationId:null,
   releaseId:null
  };
 }
 const publication=findDeliveryPublicationByPlan(plan.id);
 if(!publication||publication.status!=="published"){
  return{
   stage:"delivery" as AutonomousLifecycleStage,
   status:"waiting" as AutonomousLifecycleStatus,
   completed:false,
   deliveryPlanId:plan.id,
   publicationId:publication?.id??null,
   verificationId:null,
   releaseId:null
  };
 }
 const verification=deliveryVerificationForPlan(plan.id);
 if(!verification||!verification.verified||verification.status!=="verified"){
  return{
   stage:"verification" as AutonomousLifecycleStage,
   status:"waiting" as AutonomousLifecycleStatus,
   completed:false,
   deliveryPlanId:plan.id,
   publicationId:publication.id,
   verificationId:verification?.id??null,
   releaseId:null
  };
 }
 if(plan.status!=="delivered"){
  setDeliveryPlanStatus(plan.id,"delivered");
 }
 const release=findReleaseByPlan(plan.id);
 if(!release||release.status!=="released"){
  return{
   stage:"release" as AutonomousLifecycleStage,
   status:"waiting" as AutonomousLifecycleStatus,
   completed:false,
   deliveryPlanId:plan.id,
   publicationId:publication.id,
   verificationId:verification.id,
   releaseId:release?.id??null
  };
 }
 return{
  stage:"completed" as AutonomousLifecycleStage,
  status:"completed" as AutonomousLifecycleStatus,
  completed:true,
  deliveryPlanId:plan.id,
  publicationId:publication.id,
  verificationId:verification.id,
  releaseId:release.id
 };
}

export function recoverAutonomousLifecycles(){
 const lifecycles=listRecoverableLifecycles();
 const recovered=[];
 for(const lifecycle of lifecycles){
  try{
   try{recoverDevelopmentSession(lifecycle.projectId);}catch{}
   const before=goalExecutionState(lifecycle.goalId);
   const hasDeliveryState=Boolean(deliveryPlanForLifecycle(lifecycle));
   let synchronized:null|ReturnType<typeof synchronizeGoalExecution>=null;
   if(!hasDeliveryState){
    synchronized=synchronizeGoalExecution(lifecycle.goalId);
   }
   const state=goalExecutionState(lifecycle.goalId);
   const authority=recoveryState(lifecycle,state);
   const checkpoint=updateLifecycleCheckpoint(lifecycle.goalId,{
    ...authority,
    error:null,
    metadata:{
     ...lifecycle.metadata,
     recoveredAt:new Date().toISOString(),
     totalWork:state.total,
     completedWork:state.completed,
     graphComplete:graphComplete(state),
     durableDeliveryState:hasDeliveryState,
     releaseAuthority:authority.completed
    }
   });
   event("orchestrator.v1_lifecycle_recovered","v1 lifecycle recovered after restart",{
    projectId:lifecycle.projectId,
    component:"v1-orchestration",
    data:{
     goalId:lifecycle.goalId,
     stage:checkpoint.stage,
     status:checkpoint.status
    }
   });
   recovered.push({checkpoint,synchronized,state});
  }catch(error){
   const message=error instanceof Error?error.message:String(error);
   try{
    updateLifecycleCheckpoint(lifecycle.goalId,{
     status:"waiting",
     error:message
    });
   }catch(checkpointError){
    event("orchestrator.v1_lifecycle_recovery_checkpoint_deferred","Lifecycle recovery checkpoint write deferred",{
     projectId:lifecycle.projectId,
     component:"v1-orchestration",
     level:"warn",
     data:{
      goalId:lifecycle.goalId,
      recoveryError:message,
      checkpointError:checkpointError instanceof Error?checkpointError.message:String(checkpointError)
     }
    });
   }
  }
 }
 return recovered;
}


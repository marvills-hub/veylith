import{goalExecutionState}from"../../team/goal-team-execution.service.js";
import{loadGoalTaskGraph}from"../../goals/goal-task-graph.service.js";

export interface PreDeliveryAuthority{
 goalId:string;
 deliveryWorkItemId:string;
 total:number;
 completed:number;
 deliveryRunning:boolean;
 incompleteNonDelivery:string[];
 failedNonDelivery:string[];
 cancelledNonDelivery:string[];
 blockedNonDelivery:string[];
 ready:boolean;
}

export function assessPreDeliveryGoalAuthority(
 goalId:string,
 deliveryWorkItemId:string
):PreDeliveryAuthority{
 const state=goalExecutionState(goalId);
 const graph=loadGoalTaskGraph(goalId);
 const delivery=graph.items.find(item=>item.id===deliveryWorkItemId);
 if(!delivery)throw new Error(`Delivery work item not found: ${deliveryWorkItemId}`);
 const nonDelivery=graph.items.filter(item=>item.id!==deliveryWorkItemId);
 const incompleteNonDelivery=nonDelivery.filter(item=>item.status!=="completed").map(item=>item.id);
 const failedNonDelivery=nonDelivery.filter(item=>item.status==="failed").map(item=>item.id);
 const cancelledNonDelivery=nonDelivery.filter(item=>item.status==="cancelled").map(item=>item.id);
 const blockedNonDelivery=nonDelivery.filter(item=>item.status==="blocked").map(item=>item.id);
 const deliveryRunning=delivery.status==="running";
 return{
  goalId,
  deliveryWorkItemId,
  total:state.total,
  completed:state.completed,
  deliveryRunning,
  incompleteNonDelivery,
  failedNonDelivery,
  cancelledNonDelivery,
  blockedNonDelivery,
  ready:
   deliveryRunning&&
   nonDelivery.length>0&&
   incompleteNonDelivery.length===0&&
   failedNonDelivery.length===0&&
   cancelledNonDelivery.length===0&&
   blockedNonDelivery.length===0
 };
}

export function assertPreDeliveryGoalAuthority(
 goalId:string,
 deliveryWorkItemId:string
){
 const authority=assessPreDeliveryGoalAuthority(goalId,deliveryWorkItemId);
 if(!authority.deliveryRunning){
  throw new Error("Autonomous delivery requires the delivery work item to be running.");
 }
 if(authority.incompleteNonDelivery.length){
  throw new Error(
   `Autonomous delivery blocked by incomplete prerequisite work: ${authority.incompleteNonDelivery.join(", ")}`
  );
 }
 if(!authority.ready){
  throw new Error("Autonomous delivery goal authority was not satisfied.");
 }
 return authority;
}

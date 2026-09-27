import{loadGoalTaskGraph}from"../../goals/goal-task-graph.service.js";

function terminalGeneration(key:string){
 const match=key.match(/^v1-final-(?:review|delivery)-r(\d+)$/);
 if(match)return Number(match[1]);
 if(key==="v1-final-review"||key==="v1-final-delivery")return 0;
 return null;
}

export function assessPreDeliveryGoalAuthority(goalId:string,deliveryWorkItemId:string){
 const graph=loadGoalTaskGraph(goalId);
 const delivery=graph.items.find(item=>item.id===deliveryWorkItemId);
 if(!delivery)throw new Error(`Delivery work item not found: ${deliveryWorkItemId}`);
 if(delivery.kind!=="delivery")throw new Error(`Work item ${deliveryWorkItemId} is not delivery work.`);

 const activeGeneration=terminalGeneration(delivery.key);
 const historicalTerminal=new Set(
  graph.items
   .filter(item=>{
    if(item.kind!=="review"&&item.kind!=="delivery")return false;
    if(item.id===delivery.id)return false;
    const generation=terminalGeneration(item.key);
    if(activeGeneration===null||generation===null)return item.status==="cancelled";
    return generation<activeGeneration;
   })
   .map(item=>item.id)
 );

 const authoritative=graph.items.filter(item=>
  item.id===delivery.id||!historicalTerminal.has(item.id)
 );
 const nonDelivery=authoritative.filter(item=>item.id!==delivery.id);
 const incompleteNonDelivery=nonDelivery.filter(item=>item.status!=="completed").map(item=>item.id);
 const failedNonDelivery=nonDelivery.filter(item=>item.status==="failed").map(item=>item.id);
 const cancelledNonDelivery=nonDelivery.filter(item=>item.status==="cancelled").map(item=>item.id);
 const blockedNonDelivery=nonDelivery.filter(item=>item.status==="blocked").map(item=>item.id);
 const completed=nonDelivery.filter(item=>item.status==="completed").length;
 const deliveryRunning=delivery.status==="running";

 return{
  goalId,
  deliveryWorkItemId,
  deliveryRunning,
  total:nonDelivery.length+1,
  completed,
  incompleteNonDelivery,
  failedNonDelivery,
  cancelledNonDelivery,
  blockedNonDelivery,
  ignoredHistoricalTerminal:[...historicalTerminal],
  ready:
   deliveryRunning&&
   nonDelivery.length>0&&
   incompleteNonDelivery.length===0&&
   failedNonDelivery.length===0&&
   cancelledNonDelivery.length===0&&
   blockedNonDelivery.length===0
 };
}

export function assertPreDeliveryGoalAuthority(goalId:string,deliveryWorkItemId:string){
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
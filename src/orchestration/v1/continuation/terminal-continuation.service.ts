import{loadGoalTaskGraph}from"../../../goals/goal-task-graph.service.js";
import{expandGoalWorkGraph}from"../../../development/goal-expansion.service.js";
import type{ContinuationWorkProposal}from"../../../development/goal-expansion.types.js";

const REVIEW_BASE_KEY="v1-final-review";
const DELIVERY_BASE_KEY="v1-final-delivery";
const terminal=(status:string)=>["completed","failed","cancelled"].includes(status);
const usableTerminal=(status:string)=>status!=="cancelled"&&status!=="failed";

export interface TerminalContinuationResult{
 goalId:string;
 eligible:boolean;
 created:boolean;
 reviewPresent:boolean;
 deliveryPresent:boolean;
 addedWorkItemIds:string[];
 addedWorkKeys:string[];
 reason:string;
}

function terminalGeneration(graph:ReturnType<typeof loadGoalTaskGraph>){
 const terminalItems=graph.items.filter(item=>item.kind==="review"||item.kind==="delivery");
 let generation=1;
 for(const item of terminalItems){
  const match=item.key.match(/^v1-final-(?:review|delivery)-r(\d+)$/);
  if(match)generation=Math.max(generation,Number(match[1])+1);
 }
 if(
  terminalItems.some(item=>item.key===REVIEW_BASE_KEY||item.key===DELIVERY_BASE_KEY)
 )generation=Math.max(generation,1);
 return generation;
}

function latestUsableTerminal(graph:ReturnType<typeof loadGoalTaskGraph>,kind:"review"|"delivery"){
 const items=graph.items.filter(item=>item.kind===kind&&usableTerminal(item.status));
 return items.length?items[items.length-1]:null;
}

export function ensureTerminalReviewDelivery(goalId:string):TerminalContinuationResult{
 const graph=loadGoalTaskGraph(goalId);
 const activeReview=latestUsableTerminal(graph,"review");
 const activeDelivery=latestUsableTerminal(graph,"delivery");
 const development=graph.items.filter(item=>item.kind!=="review"&&item.kind!=="delivery");

 if(!development.length){
  return{
   goalId,
   eligible:false,
   created:false,
   reviewPresent:false,
   deliveryPresent:false,
   addedWorkItemIds:[],
   addedWorkKeys:[],
   reason:"No development work exists."
  };
 }

 const unfinished=development.filter(item=>!terminal(item.status));
 if(unfinished.length){
  return{
   goalId,
   eligible:false,
   created:false,
   reviewPresent:false,
   deliveryPresent:false,
   addedWorkItemIds:[],
   addedWorkKeys:[],
   reason:"Development work is still active."
  };
 }

 if(activeReview&&activeDelivery){
  return{
   goalId,
   eligible:true,
   created:false,
   reviewPresent:true,
   deliveryPresent:true,
   addedWorkItemIds:[],
   addedWorkKeys:[],
   reason:"Usable terminal review and delivery stages already exist."
  };
 }

 if(activeReview||activeDelivery){
  throw new Error(`Goal ${goalId} has an incomplete active terminal continuation chain.`);
 }

 const unsuccessful=development.filter(item=>item.status!=="completed");
 if(unsuccessful.length){
  return{
   goalId,
   eligible:false,
   created:false,
   reviewPresent:false,
   deliveryPresent:false,
   addedWorkItemIds:[],
   addedWorkKeys:[],
   reason:"Development graph contains unsuccessful terminal work."
  };
 }

 const dependedOn=new Set<string>();
 for(const item of development){
  for(const dependency of item.dependencies)dependedOn.add(dependency);
 }

 const leaves=development.filter(item=>!dependedOn.has(item.key));
 const dependencies=(leaves.length?leaves:development).map(item=>item.key);

 const oldTerminal=graph.items.filter(item=>item.kind==="review"||item.kind==="delivery");
 const generation=terminalGeneration(graph);
 const useGeneration=oldTerminal.length>0;

 const reviewKey=useGeneration?`${REVIEW_BASE_KEY}-r${generation}`:REVIEW_BASE_KEY;
 const deliveryKey=useGeneration?`${DELIVERY_BASE_KEY}-r${generation}`:DELIVERY_BASE_KEY;

 const proposals:ContinuationWorkProposal[]=[
  {
   key:reviewKey,
   title:"Final Autonomous Review",
   description:"Review the completed project against its goal, requirements, acceptance criteria, validation evidence, repository standards, and delivery readiness.",
   kind:"review",
   priority:100,
   dependencies
  },
  {
   key:deliveryKey,
   title:"Autonomous GitHub Delivery",
   description:"Prepare, publish, verify, and record the approved autonomous project release.",
   kind:"delivery",
   priority:100,
   dependencies:[reviewKey]
  }
 ];

 const expansion=expandGoalWorkGraph(goalId,proposals);

 return{
  goalId,
  eligible:true,
  created:expansion.addedWorkItemIds.length>0,
  reviewPresent:true,
  deliveryPresent:true,
  addedWorkItemIds:expansion.addedWorkItemIds,
  addedWorkKeys:expansion.addedWorkKeys,
  reason:useGeneration
   ?`Replacement terminal review and delivery generation ${generation} created after previous terminal chain became unusable.`
   :"Mandatory terminal review and delivery stages created."
 };
}

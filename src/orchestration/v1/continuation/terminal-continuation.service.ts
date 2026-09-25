import{loadGoalTaskGraph}from"../../../goals/goal-task-graph.service.js";
import{expandGoalWorkGraph}from"../../../development/goal-expansion.service.js";
import type{ContinuationWorkProposal}from"../../../development/goal-expansion.types.js";

const REVIEW_KEY="v1-final-review";
const DELIVERY_KEY="v1-final-delivery";
const terminal=(status:string)=>["completed","failed","cancelled"].includes(status);

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

export function ensureTerminalReviewDelivery(goalId:string):TerminalContinuationResult{
 const graph=loadGoalTaskGraph(goalId);
 const review=graph.items.find(item=>item.key===REVIEW_KEY);
 const delivery=graph.items.find(item=>item.key===DELIVERY_KEY);
 if(review&&delivery){
  return{
   goalId,
   eligible:true,
   created:false,
   reviewPresent:true,
   deliveryPresent:true,
   addedWorkItemIds:[],
   addedWorkKeys:[],
   reason:"Terminal review and delivery stages already exist."
  };
 }
 if(review||delivery){
  throw new Error(`Goal ${goalId} has an incomplete terminal continuation chain.`);
 }
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
 const proposals:ContinuationWorkProposal[]=[
  {
   key:REVIEW_KEY,
   title:"Final Autonomous Review",
   description:"Review the completed project against its goal, requirements, acceptance criteria, validation evidence, repository standards, and delivery readiness.",
   kind:"review",
   priority:100,
   dependencies
  },
  {
   key:DELIVERY_KEY,
   title:"Autonomous GitHub Delivery",
   description:"Prepare, publish, verify, and record the approved autonomous project release.",
   kind:"delivery",
   priority:100,
   dependencies:[REVIEW_KEY]
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
  reason:"Mandatory terminal review and delivery stages created."
 };
}

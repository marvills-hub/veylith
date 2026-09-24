import {getProjectGoal} from "./goal.repository.js";
import {
 listGoalWorkItems,
 newGoalWorkItem,
 saveGoalTaskGraph,
 updateGoalWorkStatus
} from "./goal-task-graph.repository.js";
import type {
 GoalTaskGraph,
 GoalWorkItem,
 GoalWorkKind,
 ProposedGoalTaskGraph
} from "./goal-task-graph.types.js";

const kinds=new Set<GoalWorkKind>([
 "analysis","architecture","implementation","test",
 "review","documentation","integration","delivery","other"
]);

const clean=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
const unique=(values:string[])=>[...new Set(values.map(clean).filter(Boolean))];

function key(value:unknown){
 return clean(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"")
  .slice(0,80);
}

function kind(value:unknown):GoalWorkKind{
 const normalized=clean(value).toLowerCase() as GoalWorkKind;
 return kinds.has(normalized)?normalized:"other";
}

function priority(value:unknown){
 const number=Number(value);
 if(!Number.isFinite(number))return 50;
 return Math.max(0,Math.min(100,Math.round(number)));
}

export function normalizeProposedTaskGraph(raw:any):ProposedGoalTaskGraph{
 const source=Array.isArray(raw?.items)?raw.items:[];
 const used=new Set<string>();
 const items=source.map((item:any,index:number)=>{
  let workKey=key(item?.key)||`work-${index+1}`;
  const base=workKey;
  let suffix=2;
  while(used.has(workKey))workKey=`${base}-${suffix++}`;
  used.add(workKey);
  return{
   key:workKey,
   title:clean(item?.title)||`Work item ${index+1}`,
   description:clean(item?.description)||clean(item?.title)||`Work item ${index+1}`,
   kind:kind(item?.kind),
   priority:priority(item?.priority),
   dependencies:unique(Array.isArray(item?.dependencies)?item.dependencies.map(String):[]).map(key),
   requirementIds:unique(Array.isArray(item?.requirementIds)?item.requirementIds.map(String):[]),
   acceptanceCriterionIds:unique(Array.isArray(item?.acceptanceCriterionIds)?item.acceptanceCriterionIds.map(String):[])
  };
 });
 return{items};
}

export function topologicalOrder(items:Array<{key:string;dependencies:string[]}>){
 const byKey=new Map(items.map(item=>[item.key,item]));
 const indegree=new Map(items.map(item=>[item.key,0]));
 const outgoing=new Map(items.map(item=>[item.key,[] as string[]]));

 for(const item of items){
  for(const dependency of item.dependencies){
   if(!byKey.has(dependency))throw new Error(`Unknown dependency "${dependency}" required by "${item.key}"`);
   if(dependency===item.key)throw new Error(`Work item "${item.key}" cannot depend on itself`);
   indegree.set(item.key,(indegree.get(item.key)??0)+1);
   outgoing.get(dependency)!.push(item.key);
  }
 }

 const ready=items
  .filter(item=>(indegree.get(item.key)??0)===0)
  .map(item=>item.key)
  .sort();

 const order:string[]=[];
 while(ready.length){
  const current=ready.shift()!;
  order.push(current);
  for(const next of outgoing.get(current)??[]){
   const count=(indegree.get(next)??0)-1;
   indegree.set(next,count);
   if(count===0){
    ready.push(next);
    ready.sort();
   }
  }
 }

 if(order.length!==items.length){
  const cyclic=items.filter(item=>!order.includes(item.key)).map(item=>item.key);
  throw new Error(`Task graph contains a dependency cycle: ${cyclic.join(", ")}`);
 }
 return order;
}

export function validateProposedTaskGraph(goalId:string,raw:ProposedGoalTaskGraph){
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);

 const graph=normalizeProposedTaskGraph(raw);
 const problems:string[]=[];
 if(!graph.items.length)problems.push("Task graph contains no work items");

 const keys=new Set(graph.items.map(item=>item.key));
 const requirementIds=new Set(goal.requirements.map(item=>item.id));
 const acceptanceIds=new Set(goal.acceptanceCriteria.map(item=>item.id));

 for(const item of graph.items){
  if(!item.title)problems.push(`${item.key} has no title`);
  if(!item.description)problems.push(`${item.key} has no description`);
  for(const dependency of item.dependencies??[]){
   if(!keys.has(dependency))problems.push(`${item.key} references unknown dependency ${dependency}`);
   if(dependency===item.key)problems.push(`${item.key} depends on itself`);
  }
  for(const id of item.requirementIds??[]){
   if(!requirementIds.has(id))problems.push(`${item.key} references unknown requirement ${id}`);
  }
  for(const id of item.acceptanceCriterionIds??[]){
   if(!acceptanceIds.has(id))problems.push(`${item.key} references unknown acceptance criterion ${id}`);
  }
 }

 for(const requirement of goal.requirements.filter(item=>item.required)){
  if(!graph.items.some(item=>(item.requirementIds??[]).includes(requirement.id))){
   problems.push(`Required requirement not covered: ${requirement.id}`);
  }
 }

 for(const criterion of goal.acceptanceCriteria){
  if(!graph.items.some(item=>(item.acceptanceCriterionIds??[]).includes(criterion.id))){
   problems.push(`Acceptance criterion not covered: ${criterion.id}`);
  }
 }

 if(!problems.length){
  try{topologicalOrder(graph.items.map(item=>({key:item.key,dependencies:item.dependencies??[]})));}
  catch(error){problems.push(error instanceof Error?error.message:String(error));}
 }

 return{valid:problems.length===0,problems,graph};
}

export function createGoalTaskGraph(goalId:string,raw:ProposedGoalTaskGraph):GoalTaskGraph{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 if(goal.status!=="ready"&&goal.status!=="active"){
  throw new Error(`Goal task graph requires ready or active goal, received ${goal.status}`);
 }

 const validation=validateProposedTaskGraph(goalId,raw);
 if(!validation.valid)throw new Error(`Invalid goal task graph: ${validation.problems.join("; ")}`);

 const proposed=validation.graph.items;
 const order=topologicalOrder(proposed.map(item=>({
  key:item.key,
  dependencies:item.dependencies??[]
 })));

 const items:GoalWorkItem[]=proposed.map(item=>newGoalWorkItem(
  goal.id,
  goal.projectId,
  {
   key:item.key,
   title:item.title,
   description:item.description,
   kind:item.kind,
   priority:item.priority??50,
   dependencies:item.dependencies??[],
   requirementIds:item.requirementIds??[],
   acceptanceCriterionIds:item.acceptanceCriterionIds??[]
  }
 ));

 saveGoalTaskGraph(items);
 return loadGoalTaskGraph(goal.id);
}

export function loadGoalTaskGraph(goalId:string):GoalTaskGraph{
 const goal=getProjectGoal(goalId);
 if(!goal)throw new Error(`Goal not found: ${goalId}`);
 const items=listGoalWorkItems(goalId);
 const order=topologicalOrder(items.map(item=>({key:item.key,dependencies:item.dependencies})));
 const dependedUpon=new Set(items.flatMap(item=>item.dependencies));
 const roots=items.filter(item=>item.dependencies.length===0).map(item=>item.key);
 const leaves=items.filter(item=>!dependedUpon.has(item.key)).map(item=>item.key);
 const createdAt=items.map(item=>item.createdAt).sort()[0]??goal.createdAt;
 const updatedAt=items.map(item=>item.updatedAt).sort().at(-1)??goal.updatedAt;
 return{
  goalId,
  projectId:goal.projectId,
  items,
  roots,
  leaves,
  executionOrder:order,
  createdAt,
  updatedAt
 };
}

export function refreshGoalTaskReadiness(goalId:string){
 const graph=loadGoalTaskGraph(goalId);
 const byKey=new Map(graph.items.map(item=>[item.key,item]));
 const changed:GoalWorkItem[]=[];

 for(const item of graph.items){
  if(!["pending","ready","blocked"].includes(item.status))continue;
  const dependencies=item.dependencies.map(dependency=>byKey.get(dependency)).filter(Boolean) as GoalWorkItem[];
  const failedDependency=dependencies.some(dependency=>
   dependency.status==="failed"||dependency.status==="cancelled"
  );
  const satisfied=dependencies.every(dependency=>dependency.status==="completed");
  const next=failedDependency?"blocked":satisfied?"ready":"pending";
  if(item.status!==next)changed.push(updateGoalWorkStatus(item.id,next));
 }
 return{graph:loadGoalTaskGraph(goalId),changed};
}

export function runnableGoalWork(goalId:string){
 const {graph}=refreshGoalTaskReadiness(goalId);
 return graph.items
  .filter(item=>item.status==="ready")
  .sort((a,b)=>b.priority-a.priority||a.key.localeCompare(b.key));
}




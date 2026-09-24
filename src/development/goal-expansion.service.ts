import{randomBytes}from"node:crypto";
import{db}from"../database/database.js";
import type{
 ContinuationWorkProposal,
 GoalExpansionResult
}from"./goal-expansion.types.js";

const kinds=new Set([
 "architecture","analysis","implementation","integration","test",
 "documentation","delivery","other"
]);

function id(){return`wrk_${randomBytes(8).toString("hex")}`;}
function clean(value:string){return String(value??"").trim();}
function unique(values:string[]=[]){
 return[...new Set(values.map(clean).filter(Boolean))];
}
function goal(goalId:string){
 return db.prepare(`
  SELECT id,project_id,requirements_json,acceptance_criteria_json
  FROM project_goals WHERE id=?
 `).get(goalId) as any;
}
function work(goalId:string){
 return db.prepare(`
  SELECT id,work_key,status,dependencies_json
  FROM goal_work_items
  WHERE goal_id=?
  ORDER BY created_at ASC,id ASC
 `).all(goalId) as any[];
}
function definitionIds(raw:any){
 let parsed:any[]=[];
 try{parsed=JSON.parse(raw||"[]");}catch{}
 return new Set(parsed.map(item=>
  typeof item==="string"?item:String(item?.id??"")
 ).filter(Boolean));
}
export function validateGoalExpansion(
 goalId:string,
 proposals:ContinuationWorkProposal[]
){
 const currentGoal=goal(goalId);
 if(!currentGoal)throw new Error(`Project goal not found: ${goalId}`);
 if(!Array.isArray(proposals)||!proposals.length)
  throw new Error("Continuation expansion requires at least one work proposal.");

 const existing=work(goalId);
 const existingKeys=new Set(existing.map(item=>String(item.work_key)));
 const proposedKeys=new Set<string>();
 const requirementIds=definitionIds(currentGoal.requirements_json);
 const acceptanceIds=definitionIds(currentGoal.acceptance_criteria_json);

 for(const proposal of proposals){
  const key=clean(proposal.key);
  if(!key)throw new Error("Continuation work key is required.");
  if(!clean(proposal.title))throw new Error(`Continuation work ${key} requires a title.`);
  if(!clean(proposal.description))throw new Error(`Continuation work ${key} requires a description.`);
  if(!kinds.has(proposal.kind))throw new Error(`Unsupported continuation work kind: ${proposal.kind}`);
  if(existingKeys.has(key))throw new Error(`Continuation work key already exists: ${key}`);
  if(proposedKeys.has(key))throw new Error(`Duplicate continuation work key: ${key}`);
  proposedKeys.add(key);
 }

 for(const proposal of proposals){
  const key=clean(proposal.key);
  for(const dependency of unique(proposal.dependencies)){
   if(dependency===key)throw new Error(`Continuation work ${key} cannot depend on itself.`);
   if(!existingKeys.has(dependency)&&!proposedKeys.has(dependency))
    throw new Error(`Continuation work ${key} has unknown dependency: ${dependency}`);
  }
  for(const requirementId of unique(proposal.requirementIds)){
   if(!requirementIds.has(requirementId))
    throw new Error(`Continuation work ${key} references unknown requirement: ${requirementId}`);
  }
  for(const acceptanceId of unique(proposal.acceptanceIds)){
   if(!acceptanceIds.has(acceptanceId))
    throw new Error(`Continuation work ${key} references unknown acceptance criterion: ${acceptanceId}`);
  }
 }

 const dependencies=new Map<string,string[]>();
 for(const item of existing){
  let values:string[]=[];
  try{values=JSON.parse(item.dependencies_json||"[]");}catch{}
  dependencies.set(String(item.work_key),values);
 }
 for(const proposal of proposals)
  dependencies.set(clean(proposal.key),unique(proposal.dependencies));

 const visiting=new Set<string>();
 const visited=new Set<string>();
 function visit(key:string){
  if(visiting.has(key))throw new Error(`Continuation expansion introduces dependency cycle at ${key}.`);
  if(visited.has(key))return;
  visiting.add(key);
  for(const dependency of dependencies.get(key)||[]){
   if(dependencies.has(dependency))visit(dependency);
  }
  visiting.delete(key);
  visited.add(key);
 }
 for(const key of dependencies.keys())visit(key);

 return{
  goal:currentGoal,
  existing,
  existingKeys,
  proposedKeys
 };
}
export function expandGoalWorkGraph(
 goalId:string,
 proposals:ContinuationWorkProposal[]
):GoalExpansionResult{
 const validated=validateGoalExpansion(goalId,proposals);
 const now=new Date().toISOString();
 const addedWorkItemIds:string[]=[];
 const addedWorkKeys:string[]=[];

 db.exec("BEGIN IMMEDIATE");
 try{
  const insert=db.prepare(`
   INSERT INTO goal_work_items(
    id,goal_id,project_id,work_key,title,description,kind,status,priority,
    dependencies_json,requirement_ids_json,acceptance_ids_json,created_at,updated_at
   )VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);
  const availableKeys=new Set(
   validated.existing
    .filter((item:any)=>String(item.status)==="completed")
    .map((item:any)=>String(item.work_key))
  );

  const pending=[...proposals];
  while(pending.length){
   let progressed=false;
   for(let index=pending.length-1;index>=0;index--){
    const proposal=pending[index];
    const dependencies=unique(proposal.dependencies);
    const dependenciesKnown=dependencies.every(key=>
     validated.existingKeys.has(key)||
     addedWorkKeys.includes(key)
    );
    if(!dependenciesKnown)continue;

    const workId=id();
    const ready=dependencies.every(key=>availableKeys.has(key));
    insert.run(
     workId,
     goalId,
     String(validated.goal.project_id),
     clean(proposal.key),
     clean(proposal.title),
     clean(proposal.description),
     proposal.kind,
     ready?"ready":"blocked",
     Number.isFinite(proposal.priority)?Number(proposal.priority):0,
     JSON.stringify(dependencies),
     JSON.stringify(unique(proposal.requirementIds)),
     JSON.stringify(unique(proposal.acceptanceIds)),
     now,
     now
    );
    addedWorkItemIds.push(workId);
    addedWorkKeys.push(clean(proposal.key));
    pending.splice(index,1);
    progressed=true;
   }
   if(!progressed)throw new Error("Unable to resolve continuation work dependencies.");
  }
  db.exec("COMMIT");
 }catch(error){
  try{db.exec("ROLLBACK");}catch{}
  throw error;
 }

 return{
  goalId,
  projectId:String(validated.goal.project_id),
  addedWorkItemIds,
  addedWorkKeys,
  skippedWorkKeys:[],
  totalWorkItems:work(goalId).length
 };
}



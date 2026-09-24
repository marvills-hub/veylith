import{now}from"../config/config.js";
import{repositoryEvolutionState}from"../evolution/repository-evolution.service.js";
import{listProjectKnowledge}from"../knowledge/project-knowledge.repository.js";
import{listRepositoryConventions}from"../conventions/repository-convention.repository.js";
import{listFailureHistory}from"../intelligence/history/failure-history.repository.js";
import type{
 EvolutionAwareContext,
 EvolutionContextRole
}from"./evolution-aware-context.types.js";

function evolutionSection(projectId:string){
 const state=repositoryEvolutionState(projectId);
 const latest=state.latestSnapshot;

 if(!latest)
  return"REPOSITORY EVOLUTION\nNo repository evolution recorded.";

 const events=state.recentEvents.slice(0,8);

 return[
  "REPOSITORY EVOLUTION",
  `Snapshots: ${state.snapshots}`,
  `Evolution events: ${state.events}`,
  `Current fingerprint: ${latest.fingerprint}`,
  `Current file count: ${latest.fileCount}`,
  latest.parentFingerprint
   ?`Previous fingerprint: ${latest.parentFingerprint}`
   :"Repository baseline: yes",
  events.length
   ?"Recent evolution:\n"+events.map(event=>
     `- [${event.type}] ${event.title}: ${event.summary}`
    ).join("\n")
   :"Recent evolution: none"
 ].join("\n");
}

function knowledgeSection(
 projectId:string,
 role:EvolutionContextRole
){
 const active=listProjectKnowledge(
  projectId,
  {status:"active",limit:100}
 );

 const relevant=active.filter(item=>{
  if(item.type==="architecture"||item.type==="constraint"||item.type==="security")
   return true;
  if(role==="tester"||role==="reviewer")
   return item.type==="testing"||item.type==="lesson";
  if(role==="developer"||role==="repair"||role==="diagnostic")
   return item.type==="implementation"||
    item.type==="dependency"||
    item.type==="lesson";
  if(role==="delivery")
   return item.type==="delivery"||item.type==="dependency";
  if(role==="documentation")
   return item.type==="domain"||
    item.type==="implementation"||
    item.type==="lesson";
  return item.type==="domain"||
   item.type==="dependency"||
   item.type==="lesson";
 });

 if(!relevant.length)
  return{
   items:[],
   prompt:"ACTIVE PROJECT KNOWLEDGE\nNo relevant active project knowledge."
  };

 return{
  items:relevant,
  prompt:[
   "ACTIVE PROJECT KNOWLEDGE",
   ...relevant.map(item=>[
    `[${item.type.toUpperCase()}] ${item.title}`,
    `Key: ${item.key}`,
    `Decision: ${item.summary}`,
    item.rationale?`Rationale: ${item.rationale}`:"",
    item.constraints.length
     ?`Constraints: ${item.constraints.join("; ")}`
     :"",
    item.consequences.length
     ?`Consequences: ${item.consequences.join("; ")}`
     :"",
    item.affectedFiles.length
     ?`Affected files: ${item.affectedFiles.join(", ")}`
     :""
   ].filter(Boolean).join("\n"))
  ].join("\n\n")
 };
}

function conventionSection(
 projectId:string,
 role:EvolutionContextRole
){
 if(
  role==="architect"||
  role==="planner"
 ){
  const items=listRepositoryConventions(
   projectId,
   undefined,
   100
  ).filter(item=>
   item.category==="structure"||
   item.category==="language"||
   item.category==="testing"
  );

  return{
   items,
   prompt:items.length
    ?[
      "LEARNED REPOSITORY CONVENTIONS",
      ...items.map(item=>
       `[${item.confidence.toUpperCase()}] ${item.key}: ${item.value}`
      )
     ].join("\n")
    :"LEARNED REPOSITORY CONVENTIONS\nNo relevant conventions learned."
  };
 }

 const items=listRepositoryConventions(
  projectId,
  undefined,
  100
 );

 return{
  items,
  prompt:items.length
   ?[
     "LEARNED REPOSITORY CONVENTIONS",
     ...items.map(item=>
      `[${item.confidence.toUpperCase()}] ${item.key}: ${item.value} (${item.evidenceCount} observations)`
     )
    ].join("\n")
   :"LEARNED REPOSITORY CONVENTIONS\nNo repository conventions learned."
 };
}

function failureSection(
 projectId:string,
 role:EvolutionContextRole
){
 if(
  ![
   "developer",
   "tester",
   "reviewer",
   "diagnostic",
   "repair"
  ].includes(role)
 ){
  return{
   items:[],
   prompt:"HISTORICAL FAILURE INTELLIGENCE\nNot required for this role."
  };
 }

 const records=listFailureHistory(
  projectId,
  20
 );

 if(!records.length)
  return{
   items:[],
   prompt:"HISTORICAL FAILURE INTELLIGENCE\nNo historical failures recorded."
  };

 return{
  items:records,
  prompt:[
   "HISTORICAL FAILURE INTELLIGENCE",
   ...records.map(item=>[
    `[${item.outcome.toUpperCase()}] ${item.failureKind}: ${item.summary}`,
    `Fingerprint: ${item.fingerprint}`,
    item.rootCause
     ?`Previous root cause: ${item.rootCause}`
     :"",
    item.repairFiles.length
     ?`Previous repair files: ${item.repairFiles.join(", ")}`
     :"",
    item.strategy.length
     ?`Previous repair strategy: ${item.strategy.join("; ")}`
     :"",
    `Occurrences: ${item.occurrences}`
   ].filter(Boolean).join("\n"))
  ].join("\n\n")
 };
}

export function buildEvolutionAwareContext(input:{
 projectId:string;
 role:EvolutionContextRole;
}):EvolutionAwareContext{
 const evolution=repositoryEvolutionState(
  input.projectId
 );
 const knowledge=knowledgeSection(
  input.projectId,
  input.role
 );
 const conventions=conventionSection(
  input.projectId,
  input.role
 );
 const failures=failureSection(
  input.projectId,
  input.role
 );

 return{
  projectId:input.projectId,
  role:input.role,
  repositoryEvolution:evolution,
  activeKnowledge:knowledge.items,
  conventions:conventions.items,
  failureHistory:failures.items,
  prompt:[
   evolutionSection(input.projectId),
   knowledge.prompt,
   conventions.prompt,
   failures.prompt
  ].join("\n\n"),
  generatedAt:now()
 };
}

export function evolutionAwareContextPrompt(
 context:EvolutionAwareContext
){
 return context.prompt;
}

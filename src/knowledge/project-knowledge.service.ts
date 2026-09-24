import{memory}from"../database/database.js";
import{
 createProjectKnowledge,
 findActiveProjectKnowledge,
 getProjectKnowledge,
 listProjectKnowledge,
 retireProjectKnowledge
}from"./project-knowledge.repository.js";
import type{
 ProjectKnowledgeState,
 ProjectKnowledgeType
}from"./project-knowledge.types.js";

export function rememberProjectKnowledge(input:{
 projectId:string;
 taskId?:string|null;
 snapshotId?:string|null;
 evolutionEventId?:string|null;
 type:ProjectKnowledgeType;
 key:string;
 title:string;
 summary:string;
 rationale?:string;
 affectedFiles?:string[];
 constraints?:string[];
 consequences?:string[];
 evidence?:string[];
 metadata?:Record<string,unknown>;
 replace?:boolean;
}){
 const existing=findActiveProjectKnowledge(
  input.projectId,
  input.key.trim()
 );

 if(existing&&!input.replace){
  if(
   existing.type===input.type&&
   existing.title===input.title.trim()&&
   existing.summary===input.summary.trim()&&
   existing.rationale===(input.rationale?.trim()||"")
  )return existing;

  throw new Error(
   `Active project knowledge already exists for key: ${input.key}`
  );
 }

 const knowledge=createProjectKnowledge({
  projectId:input.projectId,
  taskId:input.taskId,
  snapshotId:input.snapshotId,
  evolutionEventId:input.evolutionEventId,
  type:input.type,
  key:input.key,
  title:input.title,
  summary:input.summary,
  rationale:input.rationale,
  affectedFiles:input.affectedFiles,
  constraints:input.constraints,
  consequences:input.consequences,
  evidence:input.evidence,
  supersedesId:existing?.id||null,
  metadata:input.metadata
 });

 memory(
  input.projectId,
  "project_knowledge",
  JSON.stringify({
   knowledgeId:knowledge.id,
   type:knowledge.type,
   key:knowledge.key,
   status:knowledge.status,
   supersedesId:knowledge.supersedesId,
   title:knowledge.title,
   affectedFiles:knowledge.affectedFiles
  })
 );

 return knowledge;
}

export function retireRememberedProjectKnowledge(id:string){
 const knowledge=retireProjectKnowledge(id);

 memory(
  knowledge.projectId,
  "project_knowledge_retired",
  JSON.stringify({
   knowledgeId:knowledge.id,
   type:knowledge.type,
   key:knowledge.key,
   title:knowledge.title
  })
 );

 return knowledge;
}

export function projectKnowledgeState(
 projectId:string
):ProjectKnowledgeState{
 const knowledge=listProjectKnowledge(
  projectId,
  {limit:10000}
 );

 return{
  projectId,
  total:knowledge.length,
  active:knowledge.filter(
   item=>item.status==="active"
  ).length,
  superseded:knowledge.filter(
   item=>item.status==="superseded"
  ).length,
  retired:knowledge.filter(
   item=>item.status==="retired"
  ).length,
  knowledge
 };
}

export function projectKnowledgePrompt(
 projectId:string,
 limit=30
){
 const active=listProjectKnowledge(
  projectId,
  {
   status:"active",
   limit
  }
 );

 if(active.length===0)
  return"PROJECT KNOWLEDGE\nNo durable project knowledge recorded.";

 return[
  "PROJECT KNOWLEDGE",
  ...active.map(item=>{
   const parts=[
    `[${item.type.toUpperCase()}] ${item.title}`,
    `Key: ${item.key}`,
    `Decision: ${item.summary}`
   ];

   if(item.rationale)
    parts.push(`Rationale: ${item.rationale}`);

   if(item.constraints.length)
    parts.push(
     `Constraints: ${item.constraints.join("; ")}`
    );

   if(item.consequences.length)
    parts.push(
     `Consequences: ${item.consequences.join("; ")}`
    );

   if(item.affectedFiles.length)
    parts.push(
     `Affected files: ${item.affectedFiles.join(", ")}`
    );

   return parts.join("\n");
  })
 ].join("\n\n");
}

export function getRememberedProjectKnowledge(id:string){
 return getProjectKnowledge(id);
}

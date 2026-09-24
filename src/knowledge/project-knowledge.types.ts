export type ProjectKnowledgeType=
 "architecture"|
 "convention"|
 "constraint"|
 "domain"|
 "dependency"|
 "implementation"|
 "testing"|
 "security"|
 "delivery"|
 "lesson"|
 "other";

export type ProjectKnowledgeStatus=
 "active"|
 "superseded"|
 "retired";

export interface ProjectKnowledge{
 id:string;
 projectId:string;
 taskId:string|null;
 snapshotId:string|null;
 evolutionEventId:string|null;
 type:ProjectKnowledgeType;
 status:ProjectKnowledgeStatus;
 key:string;
 title:string;
 summary:string;
 rationale:string;
 affectedFiles:string[];
 constraints:string[];
 consequences:string[];
 evidence:string[];
 supersedesId:string|null;
 supersededById:string|null;
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
}

export interface ProjectKnowledgeState{
 projectId:string;
 total:number;
 active:number;
 superseded:number;
 retired:number;
 knowledge:ProjectKnowledge[];
}

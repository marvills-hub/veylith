import type {AgentRole} from "./team.types.js";
import type {RepositoryContext,RepositoryProfile} from "../intelligence/repository.types.js";

export type SharedProjectContextRequirement={
 id:string;
 text:string;
 required:boolean;
 status:string;
};
export type SharedProjectContextCriterion={
 id:string;
 text:string;
 status:string;
 evidence:string|null;
};
export type SharedProjectContextDependency={
 id:string;
 key:string;
 title:string;
 description:string;
 kind:string;
 status:string;
};
export type SharedProjectContextMemory={
 type:string;
 content:string;
 createdAt:string;
};
export type SharedProjectContextHandoff={
 id:string;
 fromAssignmentId:string;
 summary:string;
 decisions:string[];
 artifacts:{path:string;type:string;description:string}[];
 evidence:{type:string;summary:string;reference:string|null}[];
 risks:string[];
 recommendations:string[];
 metadata:Record<string,unknown>;
 status:string;
};
export type SharedProjectContext={
 goal:{
  id:string;
  projectId:string;
  title:string;
  objective:string;
  priority:string;
  status:string;
 };
 work:{
  id:string;
  key:string;
  title:string;
  description:string;
  kind:string;
  status:string;
  priority:number;
  role:AgentRole|null;
 };
 requirements:SharedProjectContextRequirement[];
 acceptanceCriteria:SharedProjectContextCriterion[];
 constraints:{type:string;text:string}[];
 dependencies:SharedProjectContextDependency[];
 handoffs:SharedProjectContextHandoff[];
 memory:SharedProjectContextMemory[];
 repository:{
  profile:RepositoryProfile;
  context:RepositoryContext;
  prompt:string;
 };
 query:string;
 prompt:string;
 generatedAt:string;
};

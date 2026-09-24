export type RepositoryConventionCategory=
 "structure"|
 "naming"|
 "testing"|
 "language"|
 "imports"|
 "formatting";

export type RepositoryConventionConfidence=
 "low"|
 "medium"|
 "high";

export interface RepositoryConvention{
 id:string;
 projectId:string;
 category:RepositoryConventionCategory;
 key:string;
 value:string;
 confidence:RepositoryConventionConfidence;
 samples:string[];
 evidenceCount:number;
 sourceFingerprint:string;
 metadata:Record<string,unknown>;
 createdAt:string;
 updatedAt:string;
}

export interface RepositoryConventionAnalysis{
 projectId:string;
 workspace:string;
 sourceFingerprint:string;
 conventions:Omit<
  RepositoryConvention,
  "id"|"createdAt"|"updatedAt"
 >[];
 analyzedFiles:number;
}

export interface RepositoryConventionState{
 projectId:string;
 total:number;
 conventions:RepositoryConvention[];
}

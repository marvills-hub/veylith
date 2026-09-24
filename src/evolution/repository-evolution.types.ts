export type RepositoryEvolutionEventType=
 "baseline"|
 "architecture"|
 "implementation"|
 "repair"|
 "refactor"|
 "test"|
 "documentation"|
 "dependency"|
 "delivery"|
 "decision"|
 "other";

export interface RepositoryEvolutionSnapshot{
 id:string;
 projectId:string;
 taskId:string|null;
 cycleId:string|null;
 workspace:string;
 sequence:number;
 fingerprint:string;
 parentFingerprint:string|null;
 fileCount:number;
 files:string[];
 metadata:Record<string,unknown>;
 createdAt:string;
}

export interface RepositoryEvolutionEvent{
 id:string;
 projectId:string;
 taskId:string|null;
 cycleId:string|null;
 snapshotId:string|null;
 type:RepositoryEvolutionEventType;
 title:string;
 summary:string;
 files:string[];
 evidence:string[];
 metadata:Record<string,unknown>;
 createdAt:string;
}

export interface RepositoryEvolutionState{
 projectId:string;
 latestSnapshot:RepositoryEvolutionSnapshot|null;
 snapshots:number;
 events:number;
 recentEvents:RepositoryEvolutionEvent[];
}

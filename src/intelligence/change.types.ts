import type {RepositoryProfile} from "./repository.types.js";

export type RepositoryMode="new"|"existing";
export type ChangeIntent="create"|"modify"|"fix"|"refactor"|"test"|"configure"|"document"|"mixed";
export type ChangeRisk="low"|"medium"|"high";
export type ChangeTarget={
 path:string;
 score:number;
 reasons:string[];
 exists:boolean;
};
export type ChangeAnalysis={
 repositoryMode:RepositoryMode;
 intent:ChangeIntent;
 risk:ChangeRisk;
 requirement:string;
 existingFiles:number;
 likelyTargets:ChangeTarget[];
 preservationRules:string[];
 warnings:string[];
};
export type FileChangeKind="create"|"modify";
export type FileChange={
 path:string;
 kind:FileChangeKind;
 planned:boolean;
 target:boolean;
};
export type ChangeValidation={
 allowed:boolean;
 repositoryMode:RepositoryMode;
 totalChanges:number;
 created:number;
 modified:number;
 unplanned:string[];
 suspicious:string[];
 changes:FileChange[];
};

export function repositoryMode(profile:RepositoryProfile):RepositoryMode{
 const meaningful=profile.files.filter(file=>file.kind==="source"||file.kind==="config"||file.kind==="test");
 return meaningful.length===0?"new":"existing";
}

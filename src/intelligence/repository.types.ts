export type RepositoryFileKind="source"|"test"|"config"|"documentation"|"asset"|"data"|"other";
export type RepositoryFile={
 path:string;
 extension:string;
 size:number;
 kind:RepositoryFileKind;
 language:string|null;
 important:boolean;
 readable:boolean;
};
export type RepositoryFramework={
 name:string;
 confidence:"high"|"medium"|"low";
 evidence:string[];
};
export type RepositoryManifest={
 path:string;
 name:string|null;
 version:string|null;
 dependencies:string[];
 devDependencies:string[];
 scripts:Record<string,string>;
};
export type RepositoryProfile={
 workspace:string;
 scannedAt:string;
 totalFiles:number;
 totalBytes:number;
 languages:Record<string,number>;
 fileKinds:Record<string,number>;
 frameworks:RepositoryFramework[];
 manifests:RepositoryManifest[];
 importantFiles:string[];
 sourceRoots:string[];
 testRoots:string[];
 files:RepositoryFile[];
};
export type ContextCandidate={
 path:string;
 score:number;
 reasons:string[];
 kind:RepositoryFileKind;
 size:number;
};
export type RepositoryContextFile={
 path:string;
 score:number;
 reasons:string[];
 content:string;
 originalBytes:number;
 includedChars:number;
 truncated:boolean;
};
export type RepositoryContext={
 query:string;
 generatedAt:string;
 budget:number;
 used:number;
 selectedFiles:number;
 files:RepositoryContextFile[];
 excluded:number;
 summary:string;
};

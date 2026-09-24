export type ValidationStage=
 "install"|
 "build"|
 "typecheck"|
 "lint"|
 "test";

export interface ValidationCommand{
 id:string;
 stage:ValidationStage;
 command:string;
 args:string[];
 cwd:string;
 script?:string;
 required:boolean;
 source:"package-script"|"typescript"|"repository";
}

export interface ValidationStrategy{
 workspace:string;
 ecosystem:"node"|"unknown";
 packageManager:"npm"|"pnpm"|"yarn"|"bun"|null;
 manifestPath:string|null;
 lockfilePath:string|null;
 typescript:boolean;
 commands:ValidationCommand[];
 generatedAt:string;
}

export interface ValidationStrategyOptions{
 workspace:string;
 includeInstall?:boolean;
}

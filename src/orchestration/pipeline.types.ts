export type DevelopmentPhase=
 |"queued"
 |"architecture"
 |"planning"
 |"development"
 |"validation"
 |"review"
 |"repair"
 |"versioning"
 |"publishing"
 |"completed"
 |"failed";

export interface DevelopmentStep{
 id:string;
 taskId:string;
 projectId:string;
 phase:DevelopmentPhase;
 agent:string;
 title:string;
 status:"queued"|"running"|"completed"|"failed";
 sequence:number;
 input?:unknown;
 output?:unknown;
 error?:string|null;
 startedAt?:string|null;
 completedAt?:string|null;
 createdAt:string;
 updatedAt:string;
}

export interface ArchitectureResult{
 summary:string;
 stack:string[];
 structure:string[];
 decisions:string[];
 risks:string[];
}

export interface PlanFile{
 path:string;
 purpose:string;
}

export interface PlanCommand{
 command:string;
 args:string[];
 purpose?:string;
}

export interface DevelopmentPlan{
 summary:string;
 architecture:string[];
 files:PlanFile[];
 commands:PlanCommand[];
}

export interface GeneratedFile{
 path:string;
 content:string;
}

export interface DevelopmentResult{
 summary:string;
 files:GeneratedFile[];
 commands:PlanCommand[];
}

export interface ReviewResult{
 approved:boolean;
 summary:string;
 issues:string[];
 recommendations:string[];
}

export interface PipelineContext{
 task:any;
 project:any;
 architecture?:ArchitectureResult;
 plan?:DevelopmentPlan;
 development?:DevelopmentResult;
 review?:ReviewResult;
 validation?:any;
 github?:any;
}

import type {GitHubFailure,GitHubFailureKind} from "./git.types.js";

export class GitHubRequestError extends Error{
 status:number;
 kind:GitHubFailureKind;
 retryable:boolean;
 constructor(status:number,message:string){
  const failure=classifyGitHubFailure(status,message);
  super(failure.message);
  this.name="GitHubRequestError";
  this.status=status;
  this.kind=failure.kind;
  this.retryable=failure.retryable;
 }
}

export function classifyGitHubFailure(status:number|null,message:string):GitHubFailure{
 let kind:GitHubFailureKind="unknown";
 let retryable=false;
 if(status===401)kind="authentication";
 else if(status===403)kind="permission";
 else if(status===404)kind="not_found";
 else if(status===409)kind="conflict";
 else if(status===422)kind="validation";
 else if(status===408||status===429||(status!==null&&status>=500)){
  kind="transient";
  retryable=true;
 }else if(status===null&&/(fetch failed|network|timeout|timed out|econnreset|econnrefused|enotfound|socket)/i.test(message)){
  kind="transient";
  retryable=true;
 }
 return{kind,retryable,status,message};
}

export function classifyUnknownGitHubFailure(error:unknown):GitHubFailure{
 if(error instanceof GitHubRequestError)return{
  kind:error.kind,
  retryable:error.retryable,
  status:error.status,
  message:error.message
 };
 const message=error instanceof Error?error.message:String(error);
 const match=message.match(/GitHub\s+(\d{3}):/i);
 return classifyGitHubFailure(match?Number(match[1]):null,message);
}

export class WorkspaceSecurityError extends Error{
 code:string;
 path?:string;
 workspace?:string;
 constructor(code:string,message:string,path?:string,workspace?:string){
  super(message);
  this.name="WorkspaceSecurityError";
  this.code=code;
  this.path=path;
  this.workspace=workspace;
 }
}
export interface WorkspacePathResult{
 workspace:string;
 requested:string;
 resolved:string;
 relative:string;
}

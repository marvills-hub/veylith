export type LogLevel="debug"|"info"|"warn"|"error"|"fatal";

export interface LogContext{
 runtimeId?:string|null;
 workerId?:string|null;
 jobId?:string|null;
 taskId?:string|null;
 projectId?:string|null;
 phase?:string|null;
 component?:string|null;
 operation?:string|null;
}

export interface LogRecord extends LogContext{
 timestamp:string;
 level:LogLevel;
 message:string;
 event?:string|null;
 data?:unknown;
 error?:{
  name:string;
  message:string;
  stack?:string;
  code?:string|number;
 };
}

export interface LogQuery{
 level?:LogLevel;
 component?:string;
 taskId?:string;
 projectId?:string;
 jobId?:string;
 runtimeId?:string;
 search?:string;
 limit?:number;
}

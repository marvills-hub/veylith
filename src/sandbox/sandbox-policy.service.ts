import type {SandboxPolicy} from "./sandbox.types.js";
function number(name:string,fallback:number,min:number){
 const value=Number(process.env[name]||fallback);
 return Number.isFinite(value)?Math.max(min,value):fallback;
}
export function sandboxPolicy():SandboxPolicy{
 const requested=(process.env.SANDBOX_PROVIDER||"host").toLowerCase();
 const provider=requested==="docker"?"docker":"host";
 return{
  provider,
  image:process.env.SANDBOX_IMAGE||"node:24-alpine",
  timeoutMs:number("SANDBOX_TIMEOUT_MS",120000,1000),
  memoryMb:number("SANDBOX_MEMORY_MB",512,128),
  cpus:number("SANDBOX_CPUS",1,0.25),
  pidsLimit:number("SANDBOX_PIDS_LIMIT",128,16),
  network:(process.env.SANDBOX_NETWORK||"true").toLowerCase()==="true",
  readOnlyRoot:(process.env.SANDBOX_READ_ONLY_ROOT||"true").toLowerCase()==="true",
  nonRoot:(process.env.SANDBOX_NON_ROOT||"true").toLowerCase()==="true"
 };
}
export function sandboxPublicPolicy(){
 const policy=sandboxPolicy();
 return{
  ...policy,
  securityLevel:policy.provider==="docker"?"isolated":"restricted-host",
  warning:policy.provider==="host"?"Host provider is not an isolation boundary. Generated commands still execute on the Veylith host.":null
 };
}

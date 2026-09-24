const normalize=(value:string)=>String(value??"").trim().toLowerCase();
const normalizedArgs=(args:string[])=>args.map(normalize).filter(Boolean);

const persistentNpmScripts=new Set([
 "start",
 "dev",
 "serve",
 "server",
 "watch",
 "preview"
]);

const persistentNodeEntries=[
 /(^|[\\/])server\.(js|cjs|mjs|ts)$/,
 /(^|[\\/])app\.(js|cjs|mjs|ts)$/,
 /(^|[\\/])main\.(js|cjs|mjs|ts)$/
];

const persistentFlags=new Set([
 "--watch",
 "-w",
 "--watch-all",
 "--watchall",
 "--watch-mode",
 "--watchmode"
]);

export interface CommandSafetyDecision{
 allowed:boolean;
 reason:string|null;
}

function npmScript(args:string[]){
 const values=normalizedArgs(args);
 if(values[0]==="start")return"start";
 if(values[0]!=="run"&&values[0]!=="run-script")return null;
 return values[1]||null;
}

function hasPersistentFlag(args:string[]){
 return normalizedArgs(args).some(arg=>
  persistentFlags.has(arg)||
  arg.startsWith("--watch=")||
  arg.startsWith("--watchall=")||
  arg.startsWith("--watch-all=")
 );
}

function nodePersistentEntry(args:string[]){
 const values=args.map(value=>String(value??"").trim()).filter(Boolean);
 const entry=values.find(value=>!value.startsWith("-"));
 if(!entry)return false;
 const normalized=entry.toLowerCase();
 return persistentNodeEntries.some(pattern=>pattern.test(normalized));
}

export function commandSafetyDecision(command:string,args:string[]):CommandSafetyDecision{
 const cmd=normalize(command);
 const values=normalizedArgs(args);

 if(hasPersistentFlag(args)){
  return{
   allowed:false,
   reason:"Persistent/watch commands are not allowed in autonomous execution."
  };
 }

 if(cmd==="npm"||cmd==="npm.cmd"){
  const script=npmScript(args);
  if(script&&persistentNpmScripts.has(script)){
   return{
    allowed:false,
    reason:`Persistent npm script is not allowed in autonomous execution: ${script}`
   };
  }
 }

 if(cmd==="pnpm"||cmd==="pnpm.cmd"||cmd==="yarn"||cmd==="yarn.cmd"||cmd==="bun"||cmd==="bun.exe"){
  const script=values[0]==="run"?values[1]:values[0];
  if(script&&persistentNpmScripts.has(script)){
   return{
    allowed:false,
    reason:`Persistent package script is not allowed in autonomous execution: ${script}`
   };
  }
 }

 if((cmd==="node"||cmd==="node.exe")&&nodePersistentEntry(args)){
  return{
   allowed:false,
   reason:"Persistent Node server entrypoints are not allowed in autonomous execution."
  };
 }

 if(
  cmd==="vite"||
  cmd==="vite.cmd"||
  cmd==="ng"&&values[0]==="serve"||
  cmd==="ng.cmd"&&values[0]==="serve"||
  cmd==="next"&&values[0]==="dev"||
  cmd==="next.cmd"&&values[0]==="dev"||
  cmd==="nodemon"||
  cmd==="nodemon.cmd"
 ){
  return{
   allowed:false,
   reason:"Persistent development server commands are not allowed in autonomous execution."
  };
 }

 return{allowed:true,reason:null};
}

export function assertAutonomousCommandSafe(command:string,args:string[]){
 const decision=commandSafetyDecision(command,args);
 if(!decision.allowed)throw new Error(decision.reason||"Command rejected by autonomous command safety policy.");
}

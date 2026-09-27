import path from "node:path";
import {readdir,lstat,readFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import type {RepositoryFile,RepositoryFileKind,RepositoryManifest,RepositoryProfile} from "./repository.types.js";

const ignored=new Set(["node_modules",".git","dist","build","coverage",".angular",".next",".nuxt",".cache",".turbo","out","target","vendor",".idea",".vscode","workspaces"]);
const secretNames=new Set([".env",".env.local",".env.production",".env.development",".npmrc",".yarnrc",".pypirc"]);
const binaryExtensions=new Set([".png",".jpg",".jpeg",".gif",".webp",".ico",".bmp",".svgz",".woff",".woff2",".ttf",".otf",".zip",".gz",".tar",".7z",".rar",".pdf",".exe",".dll",".so",".dylib",".bin",".class",".jar",".pyc",".lockb"]);
const languageMap:Record<string,string>={
 ".ts":"TypeScript",".tsx":"TypeScript/React",".js":"JavaScript",".jsx":"JavaScript/React",".mjs":"JavaScript",".cjs":"JavaScript",
 ".json":"JSON",".html":"HTML",".css":"CSS",".scss":"SCSS",".sass":"Sass",".less":"Less",".md":"Markdown",
 ".py":"Python",".php":"PHP",".java":"Java",".kt":"Kotlin",".kts":"Kotlin",".cs":"C#",".go":"Go",".rs":"Rust",
 ".dart":"Dart",".vue":"Vue",".svelte":"Svelte",".sql":"SQL",".sh":"Shell",".ps1":"PowerShell",".yml":"YAML",".yaml":"YAML",
 ".xml":"XML",".toml":"TOML",".rb":"Ruby",".swift":"Swift",".c":"C",".h":"C/C++",".cpp":"C++",".hpp":"C++"
};
const MAX_FILES=Math.max(1000,Number(process.env.REPOSITORY_SCAN_MAX_FILES||25000));
const MAX_DEPTH=Math.max(4,Number(process.env.REPOSITORY_SCAN_MAX_DEPTH||32));
const MAX_SCAN_MS=Math.max(5000,Number(process.env.REPOSITORY_SCAN_TIMEOUT_MS||30000));

function normalized(relative:string){return relative.replaceAll("\\","/")}
function isSecret(relative:string){
 const parts=normalized(relative).toLowerCase().split("/");
 return parts.some(part=>secretNames.has(part)||part===".ssh"||part.startsWith(".env."));
}
function kind(relative:string):RepositoryFileKind{
 const value=normalized(relative).toLowerCase();
 const base=path.posix.basename(value);
 if(/(^|\/)(__tests__|tests?|specs?|e2e)(\/|$)/.test(value)||/\.(spec|test)\.[^.]+$/.test(base))return"test";
 if(["package.json","tsconfig.json","angular.json","vite.config.ts","vite.config.js","webpack.config.js","eslint.config.js",".eslintrc.js","firebase.json","dockerfile","docker-compose.yml","cargo.toml","pyproject.toml","composer.json"].includes(base))return"config";
 if(base==="readme.md"||base.startsWith("readme")||[".md",".mdx"].includes(path.extname(base)))return"documentation";
 if([".png",".jpg",".jpeg",".gif",".webp",".ico",".svg",".woff",".woff2",".ttf",".otf"].includes(path.extname(base)))return"asset";
 if([".json",".yaml",".yml",".xml",".csv",".sql"].includes(path.extname(base)))return"data";
 if(languageMap[path.extname(base)])return"source";
 return"other";
}
function important(relative:string){
 const value=normalized(relative).toLowerCase();
 const base=path.posix.basename(value);
 return[
  "package.json","angular.json","tsconfig.json","tsconfig.app.json","vite.config.ts","vite.config.js","firebase.json",
  "dockerfile","docker-compose.yml","cargo.toml","pyproject.toml","composer.json","readme.md","src/main.ts","src/index.ts",
  "src/server.ts","src/app.ts","src/app/app.config.ts","src/app/app.routes.ts","src/app/app.component.ts"
 ].includes(value)||["package.json","cargo.toml","pyproject.toml","composer.json"].includes(base);
}
async function manifest(workspace:string,relative:string):Promise<RepositoryManifest|null>{
 if(path.posix.basename(normalized(relative)).toLowerCase()!=="package.json")return null;
 try{
  const raw=await readFile(path.resolve(workspace,relative),"utf8");
  const value=JSON.parse(raw);
  return{
   path:normalized(relative),
   name:typeof value.name==="string"?value.name:null,
   version:typeof value.version==="string"?value.version:null,
   dependencies:Object.keys(value.dependencies||{}).sort(),
   devDependencies:Object.keys(value.devDependencies||{}).sort(),
   scripts:typeof value.scripts==="object"&&value.scripts?value.scripts:{}
  };
 }catch{return null}
}
export async function scanRepository(workspace:string):Promise<RepositoryProfile>{
 const root=path.resolve(workspace);
 if(!existsSync(root))throw new Error(`Repository workspace does not exist: ${root}`);
 const files:RepositoryFile[]=[];
 const started=Date.now();
 const visited=new Set<string>();
 const checkLimits=()=>{
  if(Date.now()-started>MAX_SCAN_MS)throw new Error(`Repository scan exceeded ${MAX_SCAN_MS}ms limit.`);
  if(files.length>=MAX_FILES)throw new Error(`Repository scan exceeded ${MAX_FILES} file limit.`);
 };
 async function walk(current:string,depth:number){
  checkLimits();
  if(depth>MAX_DEPTH)throw new Error(`Repository scan exceeded ${MAX_DEPTH} directory depth limit.`);
  const resolved=path.resolve(current);
  const key=process.platform==="win32"?resolved.toLowerCase():resolved;
  if(visited.has(key))return;
  visited.add(key);
  let entries;
  try{entries=await readdir(current,{withFileTypes:true})}catch{return}
  for(const entry of entries){
   checkLimits();
   if(ignored.has(entry.name))continue;
   const full=path.join(current,entry.name);
   const relative=normalized(path.relative(root,full));
   if(!relative||relative.startsWith("../")||path.isAbsolute(relative))continue;
   let info;
   try{info=await lstat(full)}catch{continue}
   if(info.isSymbolicLink())continue;
   if(info.isDirectory()){
    if(typeof info.isSymbolicLink==="function"&&info.isSymbolicLink())continue;
    await walk(full,depth+1);
    continue;
   }
   if(!info.isFile())continue;
   const extension=path.extname(entry.name).toLowerCase();
   files.push({
    path:relative,
    extension,
    size:info.size,
    kind:kind(relative),
    language:languageMap[extension]||null,
    important:important(relative),
    readable:!isSecret(relative)&&!binaryExtensions.has(extension)&&info.size<=1024*1024
   });
  }
 }
 await walk(root,0);
 files.sort((a,b)=>a.path.localeCompare(b.path));
 const manifests=(await Promise.all(files.filter(file=>path.posix.basename(file.path).toLowerCase()==="package.json").map(file=>manifest(root,file.path)))).filter(Boolean) as RepositoryManifest[];
 const languages:Record<string,number>={};
 const fileKinds:Record<string,number>={};
 for(const file of files){
  if(file.language)languages[file.language]=(languages[file.language]||0)+1;
  fileKinds[file.kind]=(fileKinds[file.kind]||0)+1;
 }
 const dirs=(matcher:(file:RepositoryFile)=>boolean)=>[...new Set(files.filter(matcher).map(file=>{
  const parts=file.path.split("/");
  return parts.length>1?parts.slice(0,-1).join("/"):"."; 
 }))].slice(0,30);
 return{
  workspace:root,
  scannedAt:new Date().toISOString(),
  totalFiles:files.length,
  totalBytes:files.reduce((sum,file)=>sum+file.size,0),
  languages,
  fileKinds,
  frameworks:[],
  manifests,
  importantFiles:files.filter(file=>file.important).map(file=>file.path),
  sourceRoots:dirs(file=>file.kind==="source"),
  testRoots:dirs(file=>file.kind==="test"),
  files
 };
}

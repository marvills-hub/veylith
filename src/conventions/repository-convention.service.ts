import fs from"node:fs";
import path from"node:path";
import{memory}from"../database/database.js";
import{
 latestRepositoryEvolutionSnapshot
}from"../evolution/repository-evolution.repository.js";
import{
 listRepositoryConventions,
 upsertRepositoryConvention
}from"./repository-convention.repository.js";
import type{
 RepositoryConventionAnalysis,
 RepositoryConventionCategory,
 RepositoryConventionConfidence,
 RepositoryConventionState
}from"./repository-convention.types.js";

const TEXT_EXTENSIONS=new Set([
 ".ts",".tsx",".js",".jsx",".mjs",".cjs",
 ".json",".html",".scss",".css",".md"
]);

function normalize(value:string){
 return value.replace(/\\/g,"/");
}

function confidence(
 evidence:number,
 total:number
):RepositoryConventionConfidence{
 const ratio=total>0?evidence/total:0;
 if(evidence>=4&&ratio>=0.7)return"high";
 if(evidence>=2&&ratio>=0.45)return"medium";
 return"low";
}

function convention(input:{
 projectId:string;
 category:RepositoryConventionCategory;
 key:string;
 value:string;
 evidence:number;
 total:number;
 samples:string[];
 sourceFingerprint:string;
 metadata?:Record<string,unknown>;
}){
 return{
  projectId:input.projectId,
  category:input.category,
  key:input.key,
  value:input.value,
  confidence:confidence(input.evidence,input.total),
  samples:[...new Set(input.samples)].slice(0,12),
  evidenceCount:input.evidence,
  sourceFingerprint:input.sourceFingerprint,
  metadata:input.metadata||{}
 };
}

function dominant<T extends string|number>(
 counts:Map<T,number>
):[T,number]|null{
 return[...counts.entries()]
  .sort((a,b)=>{
   const count=b[1]-a[1];
   if(count!==0)return count;
   return String(a[0]).localeCompare(String(b[0]));
  })[0]||null;
}

function extensionLanguage(ext:string){
 const languages:Record<string,string>={
  ".ts":"TypeScript",
  ".tsx":"TypeScript JSX",
  ".js":"JavaScript",
  ".jsx":"JavaScript JSX",
  ".mjs":"JavaScript",
  ".cjs":"JavaScript",
  ".scss":"SCSS",
  ".css":"CSS",
  ".html":"HTML"
 };
 return languages[ext]||null;
}

function namingStyle(name:string){
 const stem=name.split(".")[0];
 if(/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(stem))
  return"kebab-case";
 if(/^[a-z][a-zA-Z0-9]*$/.test(stem)&&/[A-Z]/.test(stem))
  return"camelCase";
 if(/^[A-Z][a-zA-Z0-9]*$/.test(stem))
  return"PascalCase";
 if(/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(stem))
  return"snake_case";
 if(/^[a-z][a-z0-9]*$/.test(stem))
  return"kebab-case";
 return null;
}

function safeRead(file:string){
 try{
  const stat=fs.statSync(file);
  if(stat.size>512*1024)return null;
  return fs.readFileSync(file,"utf8");
 }catch{
  return null;
 }
}

export function analyzeRepositoryConventions(input:{
 projectId:string;
 workspace:string;
}):RepositoryConventionAnalysis{
 const snapshot=latestRepositoryEvolutionSnapshot(
  input.projectId
 );

 if(!snapshot)
  throw new Error(
   "Repository evolution baseline required before convention analysis."
  );

 if(
  path.resolve(snapshot.workspace)!==
  path.resolve(input.workspace)
 ){
  throw new Error(
   "Repository evolution snapshot belongs to another workspace."
  );
 }

 const files=snapshot.files.filter(file=>
  TEXT_EXTENSIONS.has(
   path.extname(file).toLowerCase()
  )
 );

 const sourceFiles=files.filter(file=>
  /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)
 );

 const results:any[]=[];

 const roots=new Map<string,number>();
 for(const file of sourceFiles){
  const parts=normalize(file).split("/");
  const root=parts.length>1?parts[0]:".";
  roots.set(root,(roots.get(root)||0)+1);
 }

 const root=dominant(roots);
 if(root){
  results.push(convention({
   projectId:input.projectId,
   category:"structure",
   key:"structure.source-root",
   value:root[0],
   evidence:root[1],
   total:sourceFiles.length,
   samples:sourceFiles.filter(file=>
    root[0]==="."
     ?!normalize(file).includes("/")
     :normalize(file).startsWith(`${root[0]}/`)
   ),
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 const extensions=new Map<string,number>();
 for(const file of sourceFiles){
  const ext=path.extname(file).toLowerCase();
  extensions.set(
   ext,
   (extensions.get(ext)||0)+1
  );
 }

 const language=dominant(extensions);
 if(language){
  const label=extensionLanguage(language[0]);
  if(label){
   results.push(convention({
    projectId:input.projectId,
    category:"language",
    key:"language.primary",
    value:label,
    evidence:language[1],
    total:sourceFiles.length,
    samples:sourceFiles.filter(file=>
     path.extname(file).toLowerCase()===language[0]
    ),
    sourceFingerprint:snapshot.fingerprint,
    metadata:{extension:language[0]}
   }));
  }
 }

 const naming=new Map<string,number>();
 const namingSamples=new Map<string,string[]>();

 for(const file of sourceFiles){
  const base=path.basename(
   file,
   path.extname(file)
  );

  if(
   /\.(spec|test)$/.test(base)||
   base==="index"
  )continue;

  const style=namingStyle(base);
  if(!style)continue;

  naming.set(
   style,
   (naming.get(style)||0)+1
  );

  namingSamples.set(
   style,
   [
    ...(namingSamples.get(style)||[]),
    file
   ]
  );
 }

 const dominantNaming=dominant(naming);
 if(dominantNaming){
  const total=[...naming.values()]
   .reduce((sum,value)=>sum+value,0);

  results.push(convention({
   projectId:input.projectId,
   category:"naming",
   key:"naming.source-files",
   value:dominantNaming[0],
   evidence:dominantNaming[1],
   total,
   samples:namingSamples.get(
    dominantNaming[0]
   )||[],
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 const specFiles=sourceFiles.filter(file=>
  /\.(spec|test)\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)
 );

 if(specFiles.length){
  const colocated=specFiles.filter(testFile=>{
   const normalized=normalize(testFile);
   return !(
    normalized.startsWith("test/")||
    normalized.startsWith("tests/")||
    normalized.startsWith("__tests__/")||
    normalized.includes("/__tests__/")
   );
  });

  const separate=specFiles.length-colocated.length;
  const value=colocated.length>=separate
   ?"colocated"
   :"separate-test-directory";

  const evidence=Math.max(
   colocated.length,
   separate
  );

  results.push(convention({
   projectId:input.projectId,
   category:"testing",
   key:"testing.placement",
   value,
   evidence,
   total:specFiles.length,
   samples:specFiles,
   sourceFingerprint:snapshot.fingerprint
  }));

  const specCount=specFiles.filter(file=>
   /\.spec\./.test(file)
  ).length;
  const testCount=specFiles.length-specCount;

  results.push(convention({
   projectId:input.projectId,
   category:"testing",
   key:"testing.filename-suffix",
   value:specCount>=testCount?".spec":".test",
   evidence:Math.max(specCount,testCount),
   total:specFiles.length,
   samples:specFiles,
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 let relativeImports=0;
 let aliasImports=0;
 let importFiles=0;
 const relativeSamples:string[]=[];
 const aliasSamples:string[]=[];
 let singleQuotes=0;
 let doubleQuotes=0;
 let semicolonLines=0;
 let statementLines=0;
 const indentCounts=new Map<number,number>();

 for(const relative of sourceFiles){
  const absolute=path.join(
   input.workspace,
   ...normalize(relative).split("/")
  );

  const content=safeRead(absolute);
  if(content===null)continue;

  const importMatches=[
   ...content.matchAll(
    /(?:from\s*|import\s*)["']([^"']+)["']/g
   )
  ];

  if(importMatches.length){
   importFiles++;
   for(const match of importMatches){
    const target=match[1];
    if(target.startsWith(".")){
     relativeImports++;
     relativeSamples.push(relative);
    }else if(
     target.startsWith("@/")||
     target.startsWith("~/")
    ){
     aliasImports++;
     aliasSamples.push(relative);
    }
   }
  }

  for(const line of content.split(/\r?\n/)){
   const trimmed=line.trim();
   if(!trimmed)continue;

   const indent=line.match(/^( +)\S/);
   if(indent&&indent[1].length<=8){
    const size=indent[1].length;
    indentCounts.set(
     size,
     (indentCounts.get(size)||0)+1
    );
   }

   if(
    /(?:import|from)\s+'[^']+'/.test(trimmed)||
    /^import\s+'[^']+'/.test(trimmed)
   )singleQuotes++;

   if(
    /(?:import|from)\s+"[^"]+"/.test(trimmed)||
    /^import\s+"[^"]+"/.test(trimmed)
   )doubleQuotes++;

   if(
    /^(import|export|const|let|var|return|throw|[A-Za-z_$][\w$]*\s*=)/.test(trimmed)
   ){
    statementLines++;
    if(trimmed.endsWith(";"))
     semicolonLines++;
   }
  }
 }

 const totalImports=relativeImports+aliasImports;
 if(totalImports){
  const useAlias=aliasImports>relativeImports;

  results.push(convention({
   projectId:input.projectId,
   category:"imports",
   key:"imports.internal-style",
   value:useAlias?"path-alias":"relative",
   evidence:Math.max(relativeImports,aliasImports),
   total:totalImports,
   samples:useAlias?aliasSamples:relativeSamples,
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 const quoteTotal=singleQuotes+doubleQuotes;
 if(quoteTotal){
  results.push(convention({
   projectId:input.projectId,
   category:"formatting",
   key:"formatting.quotes",
   value:singleQuotes>=doubleQuotes
    ?"single"
    :"double",
   evidence:Math.max(singleQuotes,doubleQuotes),
   total:quoteTotal,
   samples:sourceFiles,
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 if(statementLines){
  const semicolonEvidence=Math.max(
   semicolonLines,
   statementLines-semicolonLines
  );

  results.push(convention({
   projectId:input.projectId,
   category:"formatting",
   key:"formatting.semicolons",
   value:semicolonLines>=statementLines-semicolonLines
    ?"required"
    :"omitted",
   evidence:semicolonEvidence,
   total:statementLines,
   samples:sourceFiles,
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 const indentation=dominant(indentCounts);
 if(indentation){
  const total=[...indentCounts.values()]
   .reduce((sum,value)=>sum+value,0);

  results.push(convention({
   projectId:input.projectId,
   category:"formatting",
   key:"formatting.indentation",
   value:`${indentation[0]} spaces`,
   evidence:indentation[1],
   total,
   samples:sourceFiles,
   sourceFingerprint:snapshot.fingerprint
  }));
 }

 return{
  projectId:input.projectId,
  workspace:input.workspace,
  sourceFingerprint:snapshot.fingerprint,
  conventions:results,
  analyzedFiles:files.length
 };
}

export function learnRepositoryConventions(input:{
 projectId:string;
 workspace:string;
}){
 const analysis=analyzeRepositoryConventions(
  input
 );

 const persisted=analysis.conventions.map(item=>
  upsertRepositoryConvention(item)
 );

 memory(
  input.projectId,
  "repository_conventions",
  JSON.stringify({
   fingerprint:analysis.sourceFingerprint,
   analyzedFiles:analysis.analyzedFiles,
   conventions:persisted.map(item=>({
    key:item.key,
    value:item.value,
    confidence:item.confidence,
    evidenceCount:item.evidenceCount
   }))
  })
 );

 return{
  ...analysis,
  conventions:persisted
 };
}

export function repositoryConventionState(
 projectId:string
):RepositoryConventionState{
 const conventions=listRepositoryConventions(
  projectId,
  undefined,
  1000
 );

 return{
  projectId,
  total:conventions.length,
  conventions
 };
}

export function repositoryConventionPrompt(
 projectId:string
){
 const conventions=listRepositoryConventions(
  projectId,
  undefined,
  100
 );

 if(!conventions.length)
  return"REPOSITORY CONVENTIONS\nNo repository conventions learned.";

 return[
  "REPOSITORY CONVENTIONS",
  ...conventions.map(item=>
   `[${item.confidence.toUpperCase()}] ${item.key}: ${item.value} (${item.evidenceCount} observation${item.evidenceCount===1?"":"s"})`
  )
 ].join("\n");
}



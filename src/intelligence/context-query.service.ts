import path from "node:path";
import type {ContextCandidate,RepositoryFile,RepositoryProfile} from "./repository.types.js";

const stopWords=new Set(["the","a","an","and","or","to","of","in","on","for","with","from","this","that","is","are","be","add","create","make","fix","update","change","implement","project","app","application"]);

function terms(query:string){
 return [...new Set(query.toLowerCase().split(/[^a-z0-9_@.-]+/).map(item=>item.trim()).filter(item=>item.length>1&&!stopWords.has(item)))];
}
function tokens(value:string){
 return value.toLowerCase().split(/[^a-z0-9_@.-]+/).filter(Boolean);
}
function scoreFile(file:RepositoryFile,queryTerms:string[]){
 let score=0;
 let relevance=0;
 const reasons:string[]=[];
 const lower=file.path.toLowerCase();
 const name=path.posix.basename(lower);
 const fileTokens=tokens(lower);
 for(const term of queryTerms){
  if(name.includes(term)){
   relevance+=24;
   reasons.push(`filename:${term}`);
  }else if(fileTokens.some(token=>token===term)){
   relevance+=14;
   reasons.push(`path:${term}`);
  }else if(fileTokens.some(token=>token.includes(term)||term.includes(token))){
   relevance+=8;
   reasons.push(`path:${term}`);
  }
 }
 score+=relevance;
 if(file.kind==="test"&&queryTerms.some(term=>["test","spec","bug","failure","failing","validation","diagnose","repair"].includes(term))){
  score+=14;
  reasons.push("test-relevance");
 }
 if(file.important){
  score+=relevance>0?8:4;
  reasons.push("repository-entry");
 }
 if(file.kind==="config"){
  score+=relevance>0?6:3;
  reasons.push("configuration");
 }
 if(/^src\/(main|index|server|app)\./i.test(file.path)){
  score+=relevance>0?6:2;
  reasons.push("entry-point");
 }
 if(file.kind==="documentation")score+=relevance>0?2:0;
 if(file.size>250000)score-=8;
 if(!file.readable)score=-1000;
 return{path:file.path,score,reasons:[...new Set(reasons)],kind:file.kind,size:file.size};
}
export function rankRepositoryFiles(profile:RepositoryProfile,query:string):ContextCandidate[]{
 const queryTerms=terms(query);
 return profile.files
  .map(file=>scoreFile(file,queryTerms))
  .filter(candidate=>candidate.score>-1000)
  .sort((a,b)=>b.score-a.score||a.size-b.size||a.path.localeCompare(b.path));
}

import {simpleGit} from "simple-git";
import type {GitHubFailure} from "./git.types.js";
import {GitHubRequestError,classifyUnknownGitHubFailure} from "./github-error.service.js";
import {assertGitWorkspace,assertExpectedGitHubRemote} from "./git-safety.service.js";

export type GitHubConfig={token:string;owner:string;visibility:"private"|"public"};
export type GitHubRepository={owner:string;name:string;fullName:string;htmlUrl:string;cloneUrl:string;private:boolean;defaultBranch:string};
const API="https://api.github.com";

function headers(token:string){
 return{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"Veylith"};
}

async function parse(response:Response){
 const text=await response.text();
 if(!text)return{};
 try{return JSON.parse(text)}catch{return{message:text}}
}

async function request<T>(token:string,url:string,options:RequestInit={}):Promise<T>{
 try{
  const response=await fetch(`${API}${url}`,{...options,headers:{...headers(token),...(options.headers||{})}});
  const body:any=await parse(response);
  if(!response.ok)throw new GitHubRequestError(response.status,`GitHub ${response.status}: ${body?.message||"Request failed"}`);
  return body as T;
 }catch(error){
  if(error instanceof GitHubRequestError)throw error;
  const failure=classifyUnknownGitHubFailure(error);
  const wrapped=new Error(failure.message) as Error&{githubFailure?:GitHubFailure};
  wrapped.githubFailure=failure;
  throw wrapped;
 }
}

async function getRepository(token:string,owner:string,name:string){
 try{
  const response=await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,{headers:headers(token)});
  if(response.status===404)return null;
  const body:any=await parse(response);
  if(!response.ok)throw new GitHubRequestError(response.status,`GitHub ${response.status}: ${body?.message||"Repository lookup failed"}`);
  return body;
 }catch(error){
  if(error instanceof GitHubRequestError)throw error;
  const failure=classifyUnknownGitHubFailure(error);
  const wrapped=new Error(failure.message) as Error&{githubFailure?:GitHubFailure};
  wrapped.githubFailure=failure;
  throw wrapped;
 }
}

function mapRepository(repo:any):GitHubRepository{
 return{
  owner:repo.owner.login,
  name:repo.name,
  fullName:repo.full_name,
  htmlUrl:repo.html_url,
  cloneUrl:repo.clone_url,
  private:Boolean(repo.private),
  defaultBranch:repo.default_branch||"main"
 };
}

export async function findGitHubRepository(token:string,owner:string,name:string):Promise<GitHubRepository|null>{
 const repo=await getRepository(token,owner,name);
 return repo?mapRepository(repo):null;
}

export async function createGitHubRepository(config:GitHubConfig,name:string,description:string):Promise<GitHubRepository>{
 const existing=await findGitHubRepository(config.token,config.owner,name);
 if(existing)return existing;
 const user=await request<any>(config.token,"/user");
 const payload={
  name,
  description:description.slice(0,350),
  private:config.visibility==="private",
  auto_init:false,
  has_issues:true,
  has_projects:true,
  has_wiki:false
 };
 try{
  const repo=user.login.toLowerCase()===config.owner.toLowerCase()
   ?await request<any>(config.token,"/user/repos",{method:"POST",body:JSON.stringify(payload)})
   :await request<any>(config.token,`/orgs/${encodeURIComponent(config.owner)}/repos`,{method:"POST",body:JSON.stringify(payload)});
  return mapRepository(repo);
 }catch(error){
  const failure=classifyUnknownGitHubFailure(error);
  if(failure.kind==="validation"||failure.kind==="conflict"){
   const recovered=await findGitHubRepository(config.token,config.owner,name);
   if(recovered)return recovered;
  }
  throw error;
 }
}

export async function publishGitHubRepository(workspace:string,repository:GitHubRepository,token:string){
 const safeWorkspace=assertGitWorkspace(workspace);
 const git=simpleGit(safeWorkspace);
 const remotes=await git.getRemotes(true);
 const origin=remotes.find(remote=>remote.name==="origin");
 if(origin){
  const current=origin.refs.push||origin.refs.fetch;
  if(current){
   try{
    assertExpectedGitHubRemote(current,repository.owner,repository.name);
   }catch{
    await git.remote(["set-url","origin",repository.cloneUrl]);
   }
  }else await git.remote(["set-url","origin",repository.cloneUrl]);
 }else await git.addRemote("origin",repository.cloneUrl);
 const finalRemotes=await git.getRemotes(true);
 const finalOrigin=finalRemotes.find(remote=>remote.name==="origin");
 assertExpectedGitHubRemote(finalOrigin?.refs.push||finalOrigin?.refs.fetch||"",repository.owner,repository.name);
 await git.branch(["-M","main"]);
 const basic=Buffer.from(`x-access-token:${token}`,"utf8").toString("base64");
 await git.raw(["-c",`http.extraHeader=Authorization: Basic ${basic}`,"push","-u","origin","main"]);
 const log=await git.log({maxCount:1});
 return{branch:"main",commit:log.latest?.hash||null,remote:repository.cloneUrl,url:repository.htmlUrl};
}

export async function verifyGitHubRepository(token:string,owner:string,name:string){
 const repo=await findGitHubRepository(token,owner,name);
 if(!repo)throw new GitHubRequestError(404,`GitHub repository ${owner}/${name} was not found after publication.`);
 return repo;
}

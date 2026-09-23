import {simpleGit} from "simple-git";
export type GitHubConfig={token:string;owner:string;visibility:"private"|"public"};
export type GitHubRepository={owner:string;name:string;fullName:string;htmlUrl:string;cloneUrl:string;private:boolean;defaultBranch:string};
const API="https://api.github.com";
function headers(token:string){
 return{Accept:"application/vnd.github+json",Authorization:`Bearer ${token}`,"Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"Veylith"};
}
async function request<T>(token:string,url:string,options:RequestInit={}):Promise<T>{
 const response=await fetch(`${API}${url}`,{...options,headers:{...headers(token),...(options.headers||{})}});
 const text=await response.text();
 let body:any={};
 if(text){try{body=JSON.parse(text)}catch{body={message:text}}}
 if(!response.ok)throw new Error(`GitHub ${response.status}: ${body?.message||"Request failed"}`);
 return body as T;
}
async function getRepository(token:string,owner:string,name:string){
 const response=await fetch(`${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,{headers:headers(token)});
 if(response.status===404)return null;
 const text=await response.text();
 let body:any={};
 if(text){try{body=JSON.parse(text)}catch{body={message:text}}}
 if(!response.ok)throw new Error(`GitHub ${response.status}: ${body?.message||"Repository lookup failed"}`);
 return body;
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
export async function createGitHubRepository(config:GitHubConfig,name:string,description:string):Promise<GitHubRepository>{
 const existing=await getRepository(config.token,config.owner,name);
 if(existing)return mapRepository(existing);
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
 const repo=user.login.toLowerCase()===config.owner.toLowerCase()
  ?await request<any>(config.token,"/user/repos",{method:"POST",body:JSON.stringify(payload)})
  :await request<any>(config.token,`/orgs/${encodeURIComponent(config.owner)}/repos`,{method:"POST",body:JSON.stringify(payload)});
 return mapRepository(repo);
}
export async function publishGitHubRepository(workspace:string,repository:GitHubRepository,token:string){
 const git=simpleGit(workspace);
 const remotes=await git.getRemotes(true);
 const origin=remotes.find(remote=>remote.name==="origin");
 if(origin)await git.remote(["set-url","origin",repository.cloneUrl]);
 else await git.addRemote("origin",repository.cloneUrl);
 await git.branch(["-M","main"]);
 const basic=Buffer.from(`x-access-token:${token}`,"utf8").toString("base64");
 const authHeader=`Authorization: Basic ${basic}`;
 await git.raw([
  "-c",
  `http.extraHeader=${authHeader}`,
  "push",
  "-u",
  "origin",
  "main"
 ]);
 const log=await git.log({maxCount:1});
 return{
  branch:"main",
  commit:log.latest?.hash||null,
  remote:repository.cloneUrl,
  url:repository.htmlUrl
 };
}
export async function verifyGitHubRepository(token:string,owner:string,name:string){
 const repo=await getRepository(token,owner,name);
 if(!repo)throw new Error(`GitHub repository ${owner}/${name} was not found after publication.`);
 return mapRepository(repo);
}

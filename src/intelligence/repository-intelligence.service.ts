import {scanRepository} from "./repository-scanner.service.js";
import {classifyRepository} from "./repository-classifier.service.js";
import {buildRepositoryContext,repositoryContextPrompt} from "./repository-context.service.js";
import type {RepositoryContext,RepositoryProfile} from "./repository.types.js";

export async function analyzeRepository(workspace:string):Promise<RepositoryProfile>{
 return classifyRepository(await scanRepository(workspace));
}
export async function repositoryIntelligence(workspace:string,query:string,budget?:number):Promise<{profile:RepositoryProfile;context:RepositoryContext;prompt:string}>{
 const profile=await analyzeRepository(workspace);
 const context=await buildRepositoryContext(profile,query,budget);
 return{profile,context,prompt:repositoryContextPrompt(context)};
}

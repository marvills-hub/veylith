import{
 latestProjectRelease,
 listProjectReleases
}from"./release-history.repository.js";
import{projectReleasePrompt}from"./release-history.service.js";

export function releaseHistoryContext(projectId:string,limit=5){
 const releases=listProjectReleases(projectId,limit);
 return{
  latest:latestProjectRelease(projectId),
  releases,
  prompt:projectReleasePrompt(projectId,limit)
 };
}

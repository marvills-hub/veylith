import type {ChangeIntent,ChangeRisk,RepositoryMode} from "./change.types.js";

const patterns:Array<[ChangeIntent,RegExp]>=[
 ["fix",/\b(fix|bug|broken|failing|failure|error|issue|incorrect|regression|repair)\b/i],
 ["refactor",/\b(refactor|restructure|cleanup|clean up|reorganize|simplify)\b/i],
 ["test",/\b(test|tests|testing|spec|coverage)\b/i],
 ["configure",/\b(config|configure|configuration|environment|setting|settings)\b/i],
 ["document",/\b(document|documentation|readme|docs)\b/i],
 ["modify",/\b(update|change|modify|adjust|improve|enhance|extend|replace)\b/i],
 ["create",/\b(create|build|generate|initialize|scaffold|new)\b/i]
];

export function classifyChangeIntent(requirement:string):ChangeIntent{
 const matches=patterns.filter(([,pattern])=>pattern.test(requirement)).map(([intent])=>intent);
 if(!matches.length)return"modify";
 if(matches.includes("fix"))return"fix";
 const unique=[...new Set(matches)];
 return unique.length>1?"mixed":unique[0];
}
export function classifyChangeRisk(mode:RepositoryMode,intent:ChangeIntent,targetCount:number):ChangeRisk{
 if(mode==="new")return"low";
 if(intent==="refactor"||targetCount>12)return"high";
 if(intent==="mixed"||targetCount>6)return"medium";
 return"low";
}

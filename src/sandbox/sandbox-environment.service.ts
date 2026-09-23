const secretNames=new Set([
 "OPENAI_API_KEY",
 "OPENAI_MODEL",
 "OLLAMA_API_KEY",
 "OLLAMA_CLOUD_API_KEY",
 "OLLAMA_CLOUD_URL",
 "GITHUB_TOKEN",
 "GITHUB_OWNER",
 "GITHUB_REPO_VISIBILITY",
 "DATABASE_PATH",
 "WORKSPACE_ROOT",
 "WORKER_ID",
 "WORKER_POLL_MS",
 "METRIC_INTERVAL_MS",
 "MAX_REPAIR_ATTEMPTS",
 "VEYLITH_NAME",
 "SANDBOX_PROVIDER",
 "SANDBOX_IMAGE"
]);
const secretPatterns=[
 /token/i,
 /secret/i,
 /password/i,
 /passwd/i,
 /api[_-]?key/i,
 /private[_-]?key/i,
 /credential/i
];
export function isSecretEnvironmentKey(key:string){
 return secretNames.has(key)||secretPatterns.some(pattern=>pattern.test(key));
}
export function sandboxEnvironment(source:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
 const env:NodeJS.ProcessEnv={};
 for(const [key,value] of Object.entries(source)){
  if(value===undefined||isSecretEnvironmentKey(key))continue;
  env[key]=value;
 }
 env.PORT="0";
 env.CI="true";
 env.NODE_ENV=env.NODE_ENV||"test";
 return env;
}
export function exposedSecretNames(source:NodeJS.ProcessEnv=process.env){
 return Object.keys(source).filter(isSecretEnvironmentKey);
}

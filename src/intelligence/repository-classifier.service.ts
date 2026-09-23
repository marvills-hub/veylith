import type {RepositoryFramework,RepositoryProfile} from "./repository.types.js";

function framework(name:string,confidence:"high"|"medium"|"low",evidence:string[]):RepositoryFramework{
 return{name,confidence,evidence};
}
export function classifyRepository(profile:RepositoryProfile):RepositoryProfile{
 const dependencies=new Set(profile.manifests.flatMap(item=>[...item.dependencies,...item.devDependencies]).map(item=>item.toLowerCase()));
 const paths=new Set(profile.files.map(file=>file.path.toLowerCase()));
 const frameworks:RepositoryFramework[]=[];
 const add=(name:string,evidence:string[],confidence:"high"|"medium"|"low"="high")=>{
  if(!frameworks.some(item=>item.name===name))frameworks.push(framework(name,confidence,evidence));
 };
 if(dependencies.has("@angular/core")||paths.has("angular.json"))add("Angular",[dependencies.has("@angular/core")?"@angular/core":"angular.json"]);
 if(dependencies.has("react"))add("React",["react"]);
 if(dependencies.has("next"))add("Next.js",["next"]);
 if(dependencies.has("vue"))add("Vue",["vue"]);
 if(dependencies.has("svelte")||dependencies.has("@sveltejs/kit"))add("Svelte",["@sveltejs/kit"]);
 if(dependencies.has("express"))add("Express",["express"]);
 if(dependencies.has("fastify"))add("Fastify",["fastify"]);
 if(dependencies.has("nestjs")||dependencies.has("@nestjs/core"))add("NestJS",["@nestjs/core"]);
 if(dependencies.has("firebase")||dependencies.has("@angular/fire")||paths.has("firebase.json"))add("Firebase",[dependencies.has("firebase")?"firebase":"firebase.json"]);
 if(dependencies.has("@tauri-apps/api")||paths.has("src-tauri/tauri.conf.json"))add("Tauri",["@tauri-apps/api"]);
 if(dependencies.has("@capacitor/core"))add("Capacitor",["@capacitor/core"]);
 if(dependencies.has("typescript")||profile.languages.TypeScript||profile.languages["TypeScript/React"])add("TypeScript",["typescript"],dependencies.has("typescript")?"high":"medium");
 if(paths.has("cargo.toml")||profile.languages.Rust)add("Rust",[paths.has("cargo.toml")?"Cargo.toml":"*.rs"],paths.has("cargo.toml")?"high":"medium");
 if(paths.has("composer.json")||profile.languages.PHP)add("PHP",[paths.has("composer.json")?"composer.json":"*.php"],paths.has("composer.json")?"high":"medium");
 if(paths.has("pyproject.toml")||profile.languages.Python)add("Python",[paths.has("pyproject.toml")?"pyproject.toml":"*.py"],paths.has("pyproject.toml")?"high":"medium");
 return{...profile,frameworks};
}

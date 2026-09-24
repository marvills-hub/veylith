import path from"node:path";

function within(root:string,target:string){
 const relative=path.relative(path.resolve(root),path.resolve(target));
 return relative===""||(!relative.startsWith("..")&&!path.isAbsolute(relative));
}

const root=path.resolve("C:/VEYLITH/veylith/workspaces");
const cases=[
 [path.join(root,"project-a"),true],
 [path.join(root,"nested/project-b"),true],
 [root,true],
 [path.resolve(root,"../outside"),false],
 ["C:/VEYLITH/veylith/workspaces-evil/project",false],
 ["C:/Windows/System32",false]
] as const;

let failed=0;
for(const[target,expected]of cases){
 const actual=within(root,target);
 const pass=actual===expected;
 console.log(`${pass?"PASS":"FAIL"} ${target} => ${actual?"inside":"outside"}`);
 if(!pass)failed++;
}
console.log(`WORKSPACE CONFINEMENT: ${cases.length-failed}/${cases.length}`);
process.exitCode=failed?1:0;

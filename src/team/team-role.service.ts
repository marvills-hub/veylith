import type {AgentRole,AgentRoleDefinition} from "./team.types.js";

const roles:AgentRoleDefinition[]=[
 {role:"architect",name:"Architect",responsibility:"Establish architecture, boundaries and technical direction.",workKinds:["architecture"]},
 {role:"planner",name:"Planner",responsibility:"Translate goals and architecture into actionable development work.",workKinds:["analysis"]},
 {role:"developer",name:"Developer",responsibility:"Implement repository changes required by the assigned work.",workKinds:["implementation","integration","other"]},
 {role:"tester",name:"Tester",responsibility:"Validate implementation behavior through builds, tests and checks.",workKinds:["test"]},
 {role:"reviewer",name:"Reviewer",responsibility:"Review completed changes against requirements, acceptance criteria and repository standards.",workKinds:["review"]},
 {role:"diagnostic",name:"Diagnostic",responsibility:"Diagnose failures and identify evidence-backed root causes.",workKinds:[]},
 {role:"repair",name:"Repair",responsibility:"Apply targeted repairs after diagnosis.",workKinds:[]},
 {role:"documentation",name:"Documentation",responsibility:"Create and maintain project documentation.",workKinds:["documentation"]},
 {role:"delivery",name:"Delivery",responsibility:"Prepare validated work for Git and GitHub delivery.",workKinds:["delivery"]}
];

export function teamRoles(){
 return roles.map(item=>({...item,workKinds:[...item.workKinds]}));
}

export function getTeamRole(role:AgentRole){
 const found=roles.find(item=>item.role===role);
 if(!found)throw new Error(`Unknown Veylith team role: ${role}`);
 return{...found,workKinds:[...found.workKinds]};
}

export function roleForWorkKind(kind:string):AgentRole{
 const normalized=String(kind||"").trim().toLowerCase();
 const found=roles.find(item=>item.workKinds.includes(normalized));
 return found?.role||"developer";
}




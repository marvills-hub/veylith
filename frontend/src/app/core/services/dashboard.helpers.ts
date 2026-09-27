import {VeylithAgent,VeylithProject,VeylithTeam,DashboardData} from '../models/dashboard.model';

export const arr=<T>(value:T[]|undefined|null):T[]=>Array.isArray(value)?value:[];

export function state(value:unknown){
 return String(value||'').trim().toLowerCase();
}

export function agentState(agent?:VeylithAgent){
 const value=state(agent?.state||agent?.status);
 if(['working','running','active','executing','claimed'].includes(value))return'working';
 if(['queued','pending','created'].includes(value))return'queued';
 if(['completed','complete','done','success'].includes(value))return'completed';
 if(['failed','error'].includes(value))return'failed';
 if(value==='paused')return'paused';
 return'waiting';
}

export function projectProgress(project?:VeylithProject|null){
 const raw=Number(project?.progress??0);
 if(!Number.isFinite(raw))return 0;
 return Math.max(0,Math.min(100,raw<=1&&raw>0?raw*100:raw));
}

export function projectState(project?:VeylithProject|null){
 const value=state(project?.status||project?.state);
 if(['running','working','active','executing'].includes(value))return'active';
 if(['queued','pending','created'].includes(value))return'queued';
 if(['completed','complete','done','success','released'].includes(value))return'completed';
 if(['failed','error'].includes(value))return'failed';
 if(value==='paused')return'paused';
 return value||'idle';
}

export function members(team?:VeylithTeam|null){
 return arr(team?.team).length?arr(team?.team):arr(team?.members);
}

export function activeTeam(data:DashboardData){
 const teams=arr(data.autonomousTeams);
 return teams.find(team=>members(team).some(agent=>agentState(agent)==='working'))||teams[0]||null;
}

export function activeAgent(data:DashboardData){
 const team=activeTeam(data);
 return members(team).find(agent=>agentState(agent)==='working')||null;
}

export function roleLabel(agent?:VeylithAgent|null){
 const value=state(agent?.id||agent?.role||agent?.name);
 if(value.includes('architect'))return'ARCHITECT';
 if(value.includes('planner'))return'PLANNER';
 if(value.includes('developer'))return'DEVELOPER';
 if(value.includes('validator')||value.includes('tester'))return'VALIDATOR';
 if(value.includes('review'))return'REVIEWER';
 if(value.includes('diagnostic'))return'DIAGNOSTIC';
 if(value.includes('repair'))return'REPAIR';
 if(value.includes('version')||value.includes('git'))return'GIT';
 if(value.includes('publish'))return'PUBLISHER';
 return'VEYLITH';
}

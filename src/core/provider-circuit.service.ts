import {db} from "../database/database.js";
import {
 AI_CIRCUIT_FAILURE_THRESHOLD,
 AI_CIRCUIT_BASE_COOLDOWN_MS,
 AI_CIRCUIT_MAX_COOLDOWN_MS,
 AI_CIRCUIT_SUCCESS_THRESHOLD,
 now
} from "../config/config.js";
import {event} from "./telemetry.js";

export type CircuitState="closed"|"open"|"half_open";

export interface ProviderCircuitStatus{
 provider:string;
 state:CircuitState;
 consecutiveFailures:number;
 consecutiveSuccesses:number;
 openedAt:number|null;
 retryAt:number|null;
 cooldownMs:number;
 lastFailureAt:number|null;
 lastSuccessAt:number|null;
 lastError:string|null;
}

function defaultCircuit(provider:string):ProviderCircuitStatus{
 return{
  provider,
  state:"closed",
  consecutiveFailures:0,
  consecutiveSuccesses:0,
  openedAt:null,
  retryAt:null,
  cooldownMs:AI_CIRCUIT_BASE_COOLDOWN_MS,
  lastFailureAt:null,
  lastSuccessAt:null,
  lastError:null
 };
}

function rowToStatus(row:any):ProviderCircuitStatus{
 return{
  provider:row.provider,
  state:row.state as CircuitState,
  consecutiveFailures:Number(row.consecutive_failures||0),
  consecutiveSuccesses:Number(row.consecutive_successes||0),
  openedAt:row.opened_at===null?null:Number(row.opened_at),
  retryAt:row.retry_at===null?null:Number(row.retry_at),
  cooldownMs:Number(row.cooldown_ms||AI_CIRCUIT_BASE_COOLDOWN_MS),
  lastFailureAt:row.last_failure_at===null?null:Number(row.last_failure_at),
  lastSuccessAt:row.last_success_at===null?null:Number(row.last_success_at),
  lastError:row.last_error||null
 };
}

function save(value:ProviderCircuitStatus){
 db.prepare(`
  INSERT INTO provider_circuits(
   provider,
   state,
   consecutive_failures,
   consecutive_successes,
   opened_at,
   retry_at,
   cooldown_ms,
   last_failure_at,
   last_success_at,
   last_error,
   updated_at
  )
  VALUES(?,?,?,?,?,?,?,?,?,?,?)
  ON CONFLICT(provider) DO UPDATE SET
   state=excluded.state,
   consecutive_failures=excluded.consecutive_failures,
   consecutive_successes=excluded.consecutive_successes,
   opened_at=excluded.opened_at,
   retry_at=excluded.retry_at,
   cooldown_ms=excluded.cooldown_ms,
   last_failure_at=excluded.last_failure_at,
   last_success_at=excluded.last_success_at,
   last_error=excluded.last_error,
   updated_at=excluded.updated_at
 `).run(
  value.provider,
  value.state,
  value.consecutiveFailures,
  value.consecutiveSuccesses,
  value.openedAt,
  value.retryAt,
  value.cooldownMs,
  value.lastFailureAt,
  value.lastSuccessAt,
  value.lastError,
  now()
 );
}

function load(provider:string):ProviderCircuitStatus{
 const row=db.prepare(
  "SELECT * FROM provider_circuits WHERE provider=?"
 ).get(provider) as any;

 if(row)return rowToStatus(row);

 const value=defaultCircuit(provider);
 save(value);
 return value;
}

export function providerCircuitStatus(provider:string){
 const value=load(provider);

 if(
  value.state==="open"&&
  value.retryAt!==null&&
  Date.now()>=value.retryAt
 ){
  value.state="half_open";
  value.consecutiveSuccesses=0;
  save(value);

  event(
   "ai.circuit.half_open",
   `AI provider ${provider} entered half-open state`,
   {
    level:"warn",
    data:{
     provider,
     failures:value.consecutiveFailures,
     cooldownMs:value.cooldownMs
    }
   }
  );
 }

 return{...value};
}

export function providerRequestAllowed(provider:string){
 return providerCircuitStatus(provider).state!=="open";
}

export function recordProviderSuccess(provider:string){
 const value=load(provider);

 value.lastSuccessAt=Date.now();
 value.lastError=null;
 value.consecutiveSuccesses++;

 if(
  value.state==="half_open"&&
  value.consecutiveSuccesses>=AI_CIRCUIT_SUCCESS_THRESHOLD
 ){
  value.state="closed";
  value.consecutiveFailures=0;
  value.consecutiveSuccesses=0;
  value.openedAt=null;
  value.retryAt=null;
  value.cooldownMs=AI_CIRCUIT_BASE_COOLDOWN_MS;
  save(value);

  event(
   "ai.circuit.closed",
   `AI provider ${provider} circuit closed after successful recovery probe`,
   {
    data:{
     provider,
     lastSuccessAt:value.lastSuccessAt
    }
   }
  );

  return;
 }

 if(value.state==="closed"){
  value.consecutiveFailures=0;
  value.consecutiveSuccesses=0;
  value.cooldownMs=AI_CIRCUIT_BASE_COOLDOWN_MS;
 }

 save(value);
}

export function recordProviderFailure(provider:string,error:unknown){
 const value=load(provider);
 const message=error instanceof Error?error.message:String(error);
 const wasHalfOpen=value.state==="half_open";

 value.lastFailureAt=Date.now();
 value.lastError=message;
 value.consecutiveSuccesses=0;
 value.consecutiveFailures++;

 if(
  wasHalfOpen||
  value.consecutiveFailures>=AI_CIRCUIT_FAILURE_THRESHOLD
 ){
  const previousCooldown=value.cooldownMs;

  value.state="open";
  value.openedAt=Date.now();

  value.cooldownMs=wasHalfOpen
   ?Math.min(
     Math.max(previousCooldown*2,AI_CIRCUIT_BASE_COOLDOWN_MS),
     AI_CIRCUIT_MAX_COOLDOWN_MS
    )
   :Math.max(previousCooldown,AI_CIRCUIT_BASE_COOLDOWN_MS);

  value.retryAt=Date.now()+value.cooldownMs;

  save(value);

  event(
   "ai.circuit.open",
   `AI provider ${provider} circuit opened`,
   {
    level:"warn",
    data:{
     provider,
     failures:value.consecutiveFailures,
     cooldownMs:value.cooldownMs,
     retryAt:new Date(value.retryAt).toISOString(),
     error:message
    }
   }
  );

  return;
 }

 save(value);
}

export function providerCircuits(){
 return(
  db.prepare(
   "SELECT * FROM provider_circuits ORDER BY provider"
  ).all() as any[]
 ).map(rowToStatus);
}

import{db}from"../database/database.js";

export function extendTeamRecoveryBudget(recoveryId:string,additionalAttempts=3){
 const amount=Math.max(1,Math.min(3,Math.floor(additionalAttempts)));
 const current=db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE id=?
 `).get(recoveryId) as any;
 if(!current)return null;
 if(["recovered","failed","blocked"].includes(String(current.status)))return null;
 const time=new Date().toISOString();
 db.prepare(`
  UPDATE team_recoveries
  SET max_attempts=max_attempts+?,
      status='recovering',
      completed_at=NULL,
      updated_at=?
  WHERE id=?
 `).run(amount,time,recoveryId);
 return db.prepare(`
  SELECT *
  FROM team_recoveries
  WHERE id=?
 `).get(recoveryId) as any;
}

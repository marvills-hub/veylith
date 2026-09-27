import { recoverExhaustedTerminalRoles } from "../recovery/terminal-role-recovery.service.js";
import { recoverAutonomousLifecycles } from "../continuation/lifecycle-recovery.service.js";
import { event } from "../../../core/telemetry.js";
import { logger } from "../../../logging/logger.service.js";
import { db } from "../../../database/database.js";
import { extendJobForAutonomousRecovery } from "../../../jobs/job.repository.js";

let startupRecoveryCompleted = false;
let startupRecoveryRunning = false;
const MAX_NON_TERMINAL_REPAIR_ATTEMPTS = 2;

interface RecoverableExhaustedJob {
  jobId: string;
  taskId: string;
  projectId: string;
  workItemId: string;
  recoveryId: string;
  jobAttempts: number;
  jobMaxAttempts: number;
  repairAttempts: number;
  repairMaxAttempts: number;
}

interface RecoverableNonTerminalJob {
  jobId: string;
  taskId: string;
  projectId: string;
  workItemId: string;
  workKind: string;
  jobAttempts: number;
  jobMaxAttempts: number;
  repairAttempts: number;
}

export function autonomousLifecycleStartupRecovered() {
  return startupRecoveryCompleted;
}

function recoverableExhaustedGoalJobs(): RecoverableExhaustedJob[] {
  const rows = db
    .prepare(
      `
  SELECT
   j.id AS job_id,
   j.task_id,
   j.project_id,
   gwd.work_item_id,
   tr.id AS recovery_id,
   j.attempts AS job_attempts,
   j.max_attempts AS job_max_attempts,
   tr.attempts AS repair_attempts,
   tr.max_attempts AS repair_max_attempts
  FROM jobs j
  JOIN goal_work_dispatches gwd ON gwd.task_id=j.task_id
  JOIN team_recoveries tr ON tr.work_item_id=gwd.work_item_id
  WHERE j.status='failed'
   AND j.attempts>=j.max_attempts
   AND tr.attempts<tr.max_attempts
   AND tr.status NOT IN ('recovered','failed','blocked','exhausted')
  ORDER BY tr.updated_at DESC,j.updated_at DESC
 `,
    )
    .all() as any[];
  const seen = new Set<string>();
  const result: RecoverableExhaustedJob[] = [];
  for (const row of rows) {
    const taskId = String(row.task_id);
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    result.push({
      jobId: String(row.job_id),
      taskId,
      projectId: String(row.project_id),
      workItemId: String(row.work_item_id),
      recoveryId: String(row.recovery_id),
      jobAttempts: Number(row.job_attempts || 0),
      jobMaxAttempts: Number(row.job_max_attempts || 0),
      repairAttempts: Number(row.repair_attempts || 0),
      repairMaxAttempts: Number(row.repair_max_attempts || 0),
    });
  }
  return result;
}

function recoverableExhaustedNonTerminalJobs(): RecoverableNonTerminalJob[] {
  const rows = db
    .prepare(
      `
  SELECT
   j.id AS job_id,
   j.task_id,
   j.project_id,
   gwd.work_item_id,
   gwi.kind AS work_kind,
   j.attempts AS job_attempts,
   j.max_attempts AS job_max_attempts,
   t.repair_attempts AS repair_attempts
  FROM jobs j
  JOIN tasks t ON t.id=j.task_id
  JOIN goal_work_dispatches gwd ON gwd.task_id=j.task_id
  JOIN goal_work_items gwi ON gwi.id=gwd.work_item_id
  LEFT JOIN team_recoveries tr ON tr.work_item_id=gwd.work_item_id
  WHERE j.status='failed'
   AND j.attempts>=j.max_attempts
   AND t.status='failed'
   AND gwi.status='failed'
   AND gwi.kind NOT IN ('review','delivery')
   AND COALESCE(t.repair_attempts,0)<?
   AND tr.id IS NULL
  ORDER BY j.updated_at ASC
 `,
    )
    .all(MAX_NON_TERMINAL_REPAIR_ATTEMPTS) as any[];
  const seen = new Set<string>();
  const result: RecoverableNonTerminalJob[] = [];
  for (const row of rows) {
    const taskId = String(row.task_id);
    if (seen.has(taskId)) continue;
    seen.add(taskId);
    result.push({
      jobId: String(row.job_id),
      taskId,
      projectId: String(row.project_id),
      workItemId: String(row.work_item_id),
      workKind: String(row.work_kind),
      jobAttempts: Number(row.job_attempts || 0),
      jobMaxAttempts: Number(row.job_max_attempts || 0),
      repairAttempts: Number(row.repair_attempts || 0),
    });
  }
  return result;
}

function reopenGoalExecution(candidate: { taskId: string; projectId: string; workItemId: string }, incrementRepairAttempt = false) {
  const time = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `
   UPDATE tasks
   SET status='queued',
       phase='recovering',
       error=NULL,
       completed_at=NULL,
       repair_attempts=repair_attempts+?,
       updated_at=?
   WHERE id=?
    AND status='failed'
  `,
    ).run(incrementRepairAttempt ? 1 : 0, time, candidate.taskId);

    db.prepare(
      `
   UPDATE goal_work_items
   SET status='ready',
       completed_at=NULL,
       updated_at=?
   WHERE id=?
    AND status='failed'
  `,
    ).run(time, candidate.workItemId);

    db.prepare(
      `
   UPDATE goal_work_dispatches
   SET status='queued',
       updated_at=?
   WHERE task_id=?
    AND status='failed'
  `,
    ).run(time, candidate.taskId);

    db.prepare(
      `
   UPDATE agent_assignments
   SET status='assigned',
       started_at=NULL,
       completed_at=NULL,
       updated_at=?
   WHERE work_item_id=?
    AND status='failed'
  `,
    ).run(time, candidate.workItemId);

    db.prepare(
      `
   UPDATE projects
   SET status='active',
       phase='autonomous_development',
       updated_at=?
   WHERE id=?
    AND status='failed'
  `,
    ).run(time, candidate.projectId);

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }
}

export function recoverExhaustedAutonomousRepairs() {
  const candidates = recoverableExhaustedGoalJobs();
  const recovered: RecoverableExhaustedJob[] = [];
  for (const candidate of candidates) {
    const current = db
      .prepare(
        `
   SELECT
    j.status AS job_status,
    j.attempts AS job_attempts,
    j.max_attempts AS job_max_attempts,
    tr.status AS recovery_status,
    tr.attempts AS repair_attempts,
    tr.max_attempts AS repair_max_attempts
   FROM jobs j
   JOIN goal_work_dispatches gwd ON gwd.task_id=j.task_id
   JOIN team_recoveries tr ON tr.work_item_id=gwd.work_item_id
   WHERE j.id=? AND tr.id=?
   LIMIT 1
  `,
      )
      .get(candidate.jobId, candidate.recoveryId) as any;
    if (!current) continue;
    if (String(current.job_status) !== "failed") continue;
    if (Number(current.job_attempts) < Number(current.job_max_attempts)) continue;
    if (["recovered", "failed", "blocked", "exhausted"].includes(String(current.recovery_status || ""))) continue;
    if (Number(current.repair_attempts) >= Number(current.repair_max_attempts)) continue;

    const extended = extendJobForAutonomousRecovery(candidate.jobId, 1);
    if (!extended) continue;

    reopenGoalExecution(candidate);
    recovered.push(candidate);

    event("orchestrator.v1_exhausted_repair_recovered", `Recovered exhausted autonomous job ${candidate.jobId}`, {
      taskId: candidate.taskId,
      projectId: candidate.projectId,
      component: "v1-orchestration",
      level: "warn",
      data: {
        jobId: candidate.jobId,
        workItemId: candidate.workItemId,
        recoveryId: candidate.recoveryId,
        previousAttempts: candidate.jobAttempts,
        previousMaxAttempts: candidate.jobMaxAttempts,
        repairAttempts: candidate.repairAttempts,
        repairMaxAttempts: candidate.repairMaxAttempts,
        newMaxAttempts: Number((extended as any).max_attempts),
      },
    });
  }
  return recovered;
}

export function recoverExhaustedNonTerminalGoalWork() {
  const candidates = recoverableExhaustedNonTerminalJobs();
  const recovered: RecoverableNonTerminalJob[] = [];
  for (const candidate of candidates) {
    const current = db
      .prepare(
        `
   SELECT
    j.status AS job_status,
    j.attempts AS job_attempts,
    j.max_attempts AS job_max_attempts,
    t.status AS task_status,
    t.repair_attempts,
    gwi.status AS work_status,
    gwi.kind AS work_kind
   FROM jobs j
   JOIN tasks t ON t.id=j.task_id
   JOIN goal_work_dispatches gwd ON gwd.task_id=j.task_id
   JOIN goal_work_items gwi ON gwi.id=gwd.work_item_id
   WHERE j.id=?
    AND gwd.work_item_id=?
   LIMIT 1
  `,
      )
      .get(candidate.jobId, candidate.workItemId) as any;
    if (!current) continue;
    if (String(current.job_status) !== "failed") continue;
    if (Number(current.job_attempts) < Number(current.job_max_attempts)) continue;
    if (String(current.task_status) !== "failed") continue;
    if (String(current.work_status) !== "failed") continue;
    if (["review", "delivery"].includes(String(current.work_kind))) continue;
    if (Number(current.repair_attempts || 0) >= MAX_NON_TERMINAL_REPAIR_ATTEMPTS) continue;

    const extended = extendJobForAutonomousRecovery(candidate.jobId, 1);
    if (!extended) continue;

    try {
      reopenGoalExecution(candidate, true);
    } catch (error) {
      db.prepare(
        `
    UPDATE jobs
    SET status='failed',
        max_attempts=?,
        last_error=?,
        completed_at=?,
        updated_at=?
    WHERE id=?
   `,
      ).run(candidate.jobMaxAttempts, `Autonomous recovery rollback: ${error instanceof Error ? error.message : String(error)}`, new Date().toISOString(), new Date().toISOString(), candidate.jobId);
      throw error;
    }

    recovered.push(candidate);

    event("orchestrator.v1_non_terminal_work_recovered", `Recovered exhausted ${candidate.workKind} work ${candidate.workItemId}`, {
      taskId: candidate.taskId,
      projectId: candidate.projectId,
      component: "v1-orchestration",
      level: "warn",
      data: {
        jobId: candidate.jobId,
        workItemId: candidate.workItemId,
        workKind: candidate.workKind,
        previousAttempts: candidate.jobAttempts,
        previousMaxAttempts: candidate.jobMaxAttempts,
        previousRepairAttempts: candidate.repairAttempts,
        repairAttempt: candidate.repairAttempts + 1,
        repairMaxAttempts: MAX_NON_TERMINAL_REPAIR_ATTEMPTS,
        newMaxAttempts: Number((extended as any).max_attempts),
      },
    });
  }
  return recovered;
}

export async function recoverV1AutonomousStartup() {
  if (startupRecoveryCompleted) {
    return { skipped: true, recovered: 0, repairJobsRecovered: 0, nonTerminalJobsRecovered: 0, terminalRolesRecovered: 0 };
  }
  if (startupRecoveryRunning) {
    return { skipped: true, recovered: 0, repairJobsRecovered: 0, nonTerminalJobsRecovered: 0, terminalRolesRecovered: 0 };
  }
  startupRecoveryRunning = true;
  try {
    const terminalRoleRecovery = recoverExhaustedTerminalRoles();
    const recovered = recoverAutonomousLifecycles();
    const repairJobs = recoverExhaustedAutonomousRepairs();
    const nonTerminalJobs = recoverExhaustedNonTerminalGoalWork();
    startupRecoveryCompleted = true;
    event(
      "orchestrator.v1_startup_recovery_completed",
      `Recovered ${recovered.length} autonomous lifecycle(s), ${repairJobs.length} exhausted repair job(s), ${nonTerminalJobs.length} non-terminal job(s), and ${terminalRoleRecovery.recovered} terminal role(s)`,
      {
        component: "v1-orchestration",
        data: {
          recovered: recovered.length,
          repairJobsRecovered: repairJobs.length,
          nonTerminalJobsRecovered: nonTerminalJobs.length,
          terminalRolesRecovered: terminalRoleRecovery.recovered,
        },
      },
    );
    return {
      skipped: false,
      recovered: recovered.length,
      repairJobsRecovered: repairJobs.length,
      nonTerminalJobsRecovered: nonTerminalJobs.length,
      terminalRolesRecovered: terminalRoleRecovery.recovered,
    };
  } catch (error) {
    logger.error(
      "Veylith v1 autonomous startup recovery failed",
      {
        component: "v1-orchestration",
        operation: "startup-recovery",
      },
      undefined,
      error,
    );
    throw error;
  } finally {
    startupRecoveryRunning = false;
  }
}


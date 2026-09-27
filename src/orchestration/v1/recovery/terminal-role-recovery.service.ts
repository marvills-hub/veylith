import { db } from "../../../database/database.js";
import { now } from "../../../config/config.js";

export type TerminalRoleRecoveryResult = {
  recovered: boolean;
  reason: string;
  goalId?: string;
  projectId?: string;
  workItemId?: string;
  taskId?: string;
  jobId?: string;
  roleResultId?: string | null;
};

const LEGACY_TERMINAL_ATTEMPTS = 3;

function row(sql: string, ...args: any[]) {
  return db.prepare(sql).get(...args) as any;
}

export function recoverExhaustedTerminalRole(taskId: string): TerminalRoleRecoveryResult {
  const task = row("SELECT * FROM tasks WHERE id=?", taskId);
  if (!task) return { recovered: false, reason: "task-not-found" };

  const dispatch = row("SELECT * FROM goal_work_dispatches WHERE task_id=? LIMIT 1", taskId);
  if (!dispatch) return { recovered: false, reason: "not-goal-managed" };

  const work = row("SELECT * FROM goal_work_items WHERE id=? LIMIT 1", dispatch.work_item_id);
  if (!work) return { recovered: false, reason: "work-item-not-found" };

  if (work.kind !== "review" && work.kind !== "delivery") {
    return {
      recovered: false,
      reason: "not-terminal-role",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
    };
  }

  const lifecycle = row("SELECT * FROM autonomous_lifecycle_checkpoints WHERE goal_id=? LIMIT 1", dispatch.goal_id);
  if (!lifecycle) {
    return {
      recovered: false,
      reason: "lifecycle-not-found",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
    };
  }

  if (lifecycle.status === "completed") {
    return {
      recovered: false,
      reason: "lifecycle-completed",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
    };
  }

  const job = row("SELECT * FROM jobs WHERE task_id=? ORDER BY created_at DESC LIMIT 1", taskId);
  if (!job) {
    return {
      recovered: false,
      reason: "job-not-found",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
    };
  }

  if (job.status !== "failed" || Number(job.attempts) < Number(job.max_attempts)) {
    return {
      recovered: false,
      reason: "job-not-exhausted",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
      jobId: String(job.id),
    };
  }

  const attempts = Number(job.attempts);
  const maxAttempts = Number(job.max_attempts);

  if (attempts !== LEGACY_TERMINAL_ATTEMPTS || maxAttempts !== LEGACY_TERMINAL_ATTEMPTS) {
    return {
      recovered: false,
      reason: "terminal-recovery-budget-already-extended",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
      jobId: String(job.id),
    };
  }

  if (task.status !== "failed" || work.status !== "failed") {
    return {
      recovered: false,
      reason: "terminal-state-mismatch",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
      jobId: String(job.id),
    };
  }

  const successfulRole = row(
    `SELECT id
   FROM goal_role_results
   WHERE work_item_id=? AND status='completed'
   LIMIT 1`,
    work.id,
  );
  if (successfulRole) {
    return {
      recovered: false,
      reason: "successful-role-result-exists",
      goalId: String(dispatch.goal_id),
      projectId: String(dispatch.project_id),
      workItemId: String(dispatch.work_item_id),
      taskId,
      jobId: String(job.id),
      roleResultId: String(successfulRole.id),
    };
  }

  const roleResult = row(
    `SELECT *
   FROM goal_role_results
   WHERE work_item_id=?
   ORDER BY updated_at DESC
   LIMIT 1`,
    work.id,
  );

  const time = now();

  db.exec("BEGIN IMMEDIATE");
  try {
    const recoveredJob = db
      .prepare(
        `
   UPDATE jobs
   SET status='queued',
       max_attempts=max_attempts+1,
       available_at=?,
       claimed_by=NULL,
       claimed_at=NULL,
       lease_expires_at=NULL,
       heartbeat_at=NULL,
       last_error=NULL,
       completed_at=NULL,
       updated_at=?
   WHERE id=?
     AND status='failed'
     AND attempts=?
     AND max_attempts=?
  `,
      )
      .run(time, time, job.id, LEGACY_TERMINAL_ATTEMPTS, LEGACY_TERMINAL_ATTEMPTS);

    if (Number(recoveredJob.changes) !== 1) {
      throw new Error("Terminal recovery eligibility changed before recovery could be committed.");
    }

    db.prepare(
      `
   UPDATE tasks
   SET status='queued',
       phase='queued',
       error=NULL,
       started_at=NULL,
       completed_at=NULL,
       updated_at=?
   WHERE id=?
  `,
    ).run(time, taskId);

    db.prepare(
      `
   UPDATE goal_work_dispatches
   SET status='queued',
       updated_at=?
   WHERE work_item_id=?
  `,
    ).run(time, work.id);

    db.prepare(
      `
   UPDATE goal_work_items
   SET status='running',
       completed_at=NULL,
       updated_at=?
   WHERE id=?
  `,
    ).run(time, work.id);

    if (roleResult) {
      db.prepare(
        `
    UPDATE goal_role_results
    SET status='running',
        summary=NULL,
        result_json=NULL,
        error=NULL,
        completed_at=NULL,
        updated_at=?
    WHERE id=?
   `,
      ).run(time, roleResult.id);
    }

    db.prepare(
      `
   UPDATE autonomous_lifecycle_checkpoints
   SET stage=?,
       status='running',
       task_id=?,
       work_item_id=?,
       error=NULL,
       completed_at=NULL,
       updated_at=?
   WHERE goal_id=?
  `,
    ).run(work.kind === "delivery" ? "delivery" : "development", taskId, work.id, time, dispatch.goal_id);

    db.prepare(
      `
   UPDATE projects
   SET status='active',
       phase='autonomous_development',
       completed_at=NULL,
       updated_at=?
   WHERE id=?
  `,
    ).run(time, dispatch.project_id);

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  }

  return {
    recovered: true,
    reason: "recovered",
    goalId: String(dispatch.goal_id),
    projectId: String(dispatch.project_id),
    workItemId: String(work.id),
    taskId,
    jobId: String(job.id),
    roleResultId: roleResult ? String(roleResult.id) : null,
  };
}

export function recoverExhaustedTerminalRoles() {
  const candidates = db
    .prepare(
      `
  SELECT DISTINCT
   t.id AS task_id
  FROM tasks t
  JOIN goal_work_dispatches d
   ON d.task_id=t.id
  JOIN goal_work_items w
   ON w.id=d.work_item_id
  JOIN jobs j
   ON j.task_id=t.id
  JOIN autonomous_lifecycle_checkpoints l
   ON l.goal_id=d.goal_id
  LEFT JOIN goal_role_results rr
   ON rr.work_item_id=w.id
   AND rr.status='completed'
  WHERE w.kind IN ('review','delivery')
   AND w.status='failed'
   AND t.status='failed'
   AND j.status='failed'
   AND j.attempts=3
   AND j.max_attempts=3
   AND l.status='failed'
   AND rr.id IS NULL
  ORDER BY t.updated_at ASC
 `,
    )
    .all() as Array<{ task_id: string }>;

  const results: TerminalRoleRecoveryResult[] = [];

  for (const candidate of candidates) {
    try {
      results.push(recoverExhaustedTerminalRole(candidate.task_id));
    } catch (error) {
      results.push({
        recovered: false,
        reason: error instanceof Error ? `recovery-error: ${error.message}` : "recovery-error",
        taskId: candidate.task_id,
      });
    }
  }

  return {
    candidates: candidates.length,
    recovered: results.filter((result) => result.recovered).length,
    results,
  };
}

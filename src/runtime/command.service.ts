import { spawn } from "node:child_process";
import { db } from "../database/database.js";
import { event, broadcast } from "../core/telemetry.js";
import { now } from "../config/config.js";
const allowedCommands = new Set(["node", "npm", "npx", "git"]);
function validateCommand(command: string, args: string[]) {
  if (!allowedCommands.has(command)) throw new Error(`Executable rejected: ${command}`);
  if (!Array.isArray(args) || args.some((x) => typeof x !== "string")) throw new Error("Invalid command arguments");
  const joined = args.join(" ").toLowerCase();
  const forbidden = ["&&", "||", ";", "|", ">", "<", "..\\", "../", "rm -", "rmdir", "del ", "format ", "shutdown", "reboot", "powershell", "cmd.exe", "bash", "sudo"];
  if (forbidden.some((x) => joined.includes(x))) throw new Error(`Unsafe command rejected: ${command} ${args.join(" ")}`);
}
function projectEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PORT: "0" };
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO_VISIBILITY",
    "DATABASE_PATH",
    "WORKSPACE_ROOT",
    "WORKER_POLL_MS",
    "METRIC_INTERVAL_MS",
    "MAX_REPAIR_ATTEMPTS",
    "VEYLITH_NAME",
  ])
    delete env[key];
  return env;
}
export async function runCommand(command: string, args: string[], cwd: string, taskId: string, projectId: string) {
  validateCommand(command, args);
  event("command.started", `${command} ${args.join(" ")}`, { taskId, projectId });
  const started = Date.now();
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const executable = process.platform === "win32" && ["npm", "npx"].includes(command) ? `${command}.cmd` : command;
    const child = spawn(executable, args, { cwd, env: projectEnvironment(), windowsHide: true, shell: false });
    let stdout = "",
      stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      event("command.timeout", `${command} exceeded execution limit`, { taskId, projectId, level: "error" });
    }, 120000);
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout = (stdout + text).slice(-50000);
      broadcast("terminal", { task_id: taskId, project_id: projectId, stream: "stdout", text });
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr = (stderr + text).slice(-50000);
      broadcast("terminal", { task_id: taskId, project_id: projectId, stream: "stderr", text });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const exit = code ?? -1;
      const duration = Date.now() - started;
      db.prepare("INSERT INTO executions(project_id,task_id,command,args,exit_code,stdout,stderr,duration_ms,created_at) VALUES(?,?,?,?,?,?,?,?,?)").run(
        projectId,
        taskId,
        command,
        JSON.stringify(args),
        exit,
        stdout.slice(-12000),
        stderr.slice(-12000),
        duration,
        now(),
      );
      event(exit === 0 ? "command.completed" : "command.failed", `${command} exited with ${exit}`, { taskId, projectId, level: exit === 0 ? "info" : "error", data: { duration } });
      resolve({ code: exit, stdout, stderr });
    });
  });
}

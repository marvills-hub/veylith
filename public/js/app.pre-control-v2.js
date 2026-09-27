import { $ } from "./core/utils.js";
import { getState, setState } from "./core/state.js";
import { api } from "./api/client.js";
import { connectEvents, eventConnectionState } from "./api/events.js";
import { renderStats, renderWorkers, renderProjects } from "./components/summary.js";
import { renderTasks, renderEvents, prependEvent } from "./components/activity.js";
import { metric, metrics } from "./components/charts.js";
import { renderSystem } from "./components/health.js";
import { renderAutonomousTeam } from "./components/autonomous-team.js";
import { renderPublication } from "./components/publication.js";
import { setupTaskModal } from "./components/task-modal.js";
import { setupTaskControl, renderTaskControl } from "./components/task-control.js";
import { setupOperations, loadOperations } from "./components/operations.js";
import { streamConnectionChanged, apiRequestSucceeded, apiRequestFailed, renderConnectionHealth, startConnectionHealth } from "./components/connection-health.js";

let refreshing = false;
let pollTimer = null;
let stopped = false;

function selectTask(id) {
  setState({ selectedTaskId: id });
  renderTaskControl(id);
}

function render(data, initial = false) {
  setState({ dashboard: data });
  renderStats(data);
  renderWorkers(data);
  renderProjects(data);
  renderTasks(data, selectTask);
  renderSystem(data);
  renderAutonomousTeam(data);
  renderPublication(data);
  renderConnectionHealth(data);

  if (initial) {
    renderEvents(data);
    metrics(data.metrics);
  }

  if (getState().selectedTaskId) renderTaskControl();
}

async function refresh(initial = false) {
  if (refreshing) return false;
  refreshing = true;

  try {
    const data = await api.dashboard();
    apiRequestSucceeded(data);
    render(data, initial);
    return true;
  } catch (error) {
    apiRequestFailed();
    console.error(error);
    return false;
  } finally {
    refreshing = false;
  }
}

function stream(message) {
  if (message.channel === "metric") {
    metric(message.payload);
  }

  if (message.channel === "event") {
    prependEvent(message.payload);
  }

  if (message.channel === "terminal") {
    const terminal = $("terminal");
    if (terminal) {
      terminal.textContent += `\n${message.payload.text}`;
      terminal.scrollTop = terminal.scrollHeight;
    }
  }

  if (
    message.channel === "metric" ||
    message.channel === "event" ||
    message.channel === "worker" ||
    message.channel === "worker_slots" ||
    message.channel === "phase" ||
    message.channel === "task" ||
    message.channel === "job"
  ) {
    refresh(false);
  }
}

function schedulePoll() {
  if (stopped) return;
  if (pollTimer) clearTimeout(pollTimer);

  const connection = eventConnectionState();
  const wait = connection.connected ? 15000 : 5000;

  pollTimer = setTimeout(async () => {
    await refresh(false);
    schedulePoll();
  }, wait);
}

setupTaskModal(() => refresh(false));
setupTaskControl(() => refresh(false));
setupOperations();
startConnectionHealth();

connectEvents(stream, (info) => {
  streamConnectionChanged(info);
  if (info.state === "live") refresh(false);
  schedulePoll();
});

await refresh(true);
loadOperations();
schedulePoll();

setInterval(() => loadOperations(true), 30000);

window.addEventListener("beforeunload", () => {
  stopped = true;
  if (pollTimer) clearTimeout(pollTimer);
});

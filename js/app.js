async function refresh() {
  state.tasks = await getAllTasks();
  render();
}

function shiftSelectedDate(days) {
  const next = addDays(parseDateOnly(selectedDate()), days);
  $("selectedDate").value = localDateString(next);
  render();
}

function clearTaskInputErrors() {
  $("taskName").classList.remove("input-error");
  $("taskHours").classList.remove("input-error");
  $("taskMinutes").classList.remove("input-error");
}

function markTaskInputError(...ids) {
  for (const id of ids) $(id).classList.add("input-error");
  $(ids[0]).focus();
}

function hasDurationInput() {
  return $("taskHours").value !== "" || $("taskMinutes").value !== "";
}

function readLogDuration() {
  const hours = parseTimeField($("taskHours").value);
  const minutes = parseTimeField($("taskMinutes").value);
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return { error: true };
  }
  const ms = hours * 3600000 + minutes * 60000;
  if (ms <= 0) return { error: true };
  return { ms };
}

function resetTaskInputs() {
  $("taskName").value = "";
  $("taskHours").value = "";
  $("taskMinutes").value = "";
  clearTaskInputErrors();
}

async function startTask(presetName) {
  const name = (typeof presetName === "string" ? presetName : $("taskName").value).trim();
  if (!name) {
    markTaskInputError("taskName");
    return;
  }

  const alreadyRunning = runningTask();
  if (alreadyRunning) return;

  const task = {
    id: crypto.randomUUID(),
    name,
    date: localDateString(new Date()),
    startedAt: Date.now(),
    stoppedAt: null,
    manualDurationMs: null
  };

  await putTask(task);
  resetTaskInputs();
  $("selectedDate").value = localDateString();
  window.scrollTo({ top: 0 });
  await refresh();
}

async function logTask(presetName) {
  const name = (typeof presetName === "string" ? presetName : $("taskName").value).trim();
  if (!name) {
    markTaskInputError("taskName");
    return;
  }

  const duration = readLogDuration();
  if (duration.error) {
    markTaskInputError("taskHours", "taskMinutes");
    return;
  }

  const now = Date.now();
  const task = {
    id: crypto.randomUUID(),
    name,
    date: selectedDate(),
    startedAt: null,
    stoppedAt: now,
    manualDurationMs: duration.ms
  };

  await putTask(task);
  resetTaskInputs();
  await refresh();
}

function submitTaskFromKeyboard() {
  if (hasDurationInput()) logTask();
  else startTask();
}

async function stopTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  task.stoppedAt = Date.now();
  await putTask(task);
  await refresh();
}

async function restartTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  const alreadyRunning = runningTask();
  if (alreadyRunning) return;

  // Freeze the currently displayed total, then start a new timing segment.
  // Replace accumulated time instead of adding onto it. Adding would
  // double-count after an hours edit, because the edited value already
  // includes (or replaces) any previous accumulated duration.
  const previousDurationMs = durationMs(task);

  task.manualDurationMs = null;
  task.startedAt = Date.now();
  task.stoppedAt = null;
  task.accumulatedDurationMs = previousDurationMs;
  task.date = localDateString(new Date());

  await putTask(task);
  $("selectedDate").value = localDateString();
  window.scrollTo({ top: 0 });
  await refresh();
}

function editTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  openEditModal(task);
}

function parseTimeField(value) {
  if (value === "" || value == null) return 0;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

async function saveEdit() {
  const name = $("editName").value.trim();
  if (!name) {
    showEditError("Enter a task name.");
    $("editName").focus();
    return;
  }

  const hours = parseTimeField($("editHours").value);
  const minutes = parseTimeField($("editMinutes").value);
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    showEditError("Enter whole hours and minutes (0–59).");
    return;
  }

  const task = state.tasks.find(t => t.id === state.editingTaskId);
  if (!task) return;

  task.name = name;

  // Edited time replaces the entire tracked total, including any time
  // accumulated from earlier restart sessions.
  task.manualDurationMs = hours * 3600000 + minutes * 60000;
  task.accumulatedDurationMs = null;
  task.stoppedAt = task.stoppedAt || Date.now();

  await putTask(task);
  closeModal();
  await refresh();
}

async function removeTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const ok = await askConfirm({
    title: "Delete task",
    message: `Delete “${task.name}”? This cannot be undone.`,
    okLabel: "Delete",
    danger: true
  });
  if (!ok) return;
  await deleteTask(id);
  await refresh();
}

async function clearDb() {
  const ok = await askConfirm({
    title: "Clear all data",
    message: "Delete ALL tracked tasks from IndexedDB? This cannot be undone.",
    okLabel: "Clear all data",
    danger: true
  });
  if (!ok) return;
  await clearDatabase();
  await refresh();
}

function backupFilename() {
  return `task-tracker-${localDateString()}.json`;
}

async function downloadDb() {
  const tasks = await getAllTasks();
  const payload = {
    app: "task-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFilename();
  a.click();
  URL.revokeObjectURL(url);
}

function optionalNumber(value) {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseBackup(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (data && typeof data === "object" && !Array.isArray(data) && data.app && data.app !== "task-tracker") {
    throw new Error("That file is not a Task Tracker backup.");
  }

  const list = Array.isArray(data) ? data : data && Array.isArray(data.tasks) ? data.tasks : null;
  if (!list) throw new Error("That file does not contain a task list.");

  const tasks = [];
  const ids = new Set();
  for (const item of list) {
    if (!item || typeof item !== "object") throw new Error("Backup contains an invalid task.");
    if (typeof item.id !== "string" || !item.id) throw new Error("A task is missing an id.");
    if (ids.has(item.id)) throw new Error("Backup contains duplicate task ids.");
    ids.add(item.id);
    if (typeof item.name !== "string" || !item.name.trim()) throw new Error("A task is missing a name.");
    if (typeof item.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      throw new Error("A task has an invalid date.");
    }

    const startedAt = optionalNumber(item.startedAt);
    const stoppedAt = optionalNumber(item.stoppedAt);
    const manualDurationMs = optionalNumber(item.manualDurationMs);
    const accumulatedDurationMs = optionalNumber(item.accumulatedDurationMs);
    if (startedAt === undefined || stoppedAt === undefined ||
        manualDurationMs === undefined || accumulatedDurationMs === undefined) {
      throw new Error("A task has an invalid time value.");
    }

    tasks.push({
      id: item.id,
      name: item.name.trim(),
      date: item.date,
      startedAt,
      stoppedAt,
      manualDurationMs,
      accumulatedDurationMs
    });
  }
  return tasks;
}

function chooseBackupFile() {
  $("uploadDbInput").value = "";
  $("uploadDbInput").click();
}

async function uploadDb(file) {
  if (!file) return;

  let tasks;
  try {
    tasks = parseBackup(await file.text());
  } catch (err) {
    await askConfirm({
      title: "Could not restore backup",
      message: err.message || "The selected file could not be imported.",
      okLabel: "OK",
      hideCancel: true
    });
    return;
  }

  const ok = await askConfirm({
    title: "Replace all data?",
    message: `This will replace all current tasks with ${tasks.length} task${tasks.length === 1 ? "" : "s"} from “${file.name}”. This cannot be undone.`,
    okLabel: "Replace data",
    danger: true
  });
  if (!ok) return;

  await replaceAllTasks(tasks);
  await refresh();
}

$("startBtn").addEventListener("click", () => startTask());
$("logBtn").addEventListener("click", () => logTask());
$("taskName").addEventListener("keydown", e => {
  if (e.key === "Enter") submitTaskFromKeyboard();
});
$("taskHours").addEventListener("keydown", e => {
  if (e.key === "Enter") submitTaskFromKeyboard();
});
$("taskMinutes").addEventListener("keydown", e => {
  if (e.key === "Enter") submitTaskFromKeyboard();
});
$("taskName").addEventListener("input", () => {
  $("taskName").classList.remove("input-error");
});
$("taskHours").addEventListener("input", () => {
  $("taskHours").classList.remove("input-error");
  $("taskMinutes").classList.remove("input-error");
});
$("taskMinutes").addEventListener("input", () => {
  $("taskHours").classList.remove("input-error");
  $("taskMinutes").classList.remove("input-error");
});
$("selectedDate").addEventListener("change", render);
$("prevDay").addEventListener("click", () => shiftSelectedDate(-1));
$("nextDay").addEventListener("click", () => shiftSelectedDate(1));
$("prevWeek").addEventListener("click", () => shiftSelectedDate(-7));
$("nextWeek").addEventListener("click", () => shiftSelectedDate(7));
$("todayBtn").addEventListener("click", () => {
  $("selectedDate").value = localDateString();
  render();
});
$("recentTasks").addEventListener("click", e => {
  const chip = e.target.closest("[data-name]");
  if (!chip || chip.disabled) return;
  if (hasDurationInput()) logTask(chip.dataset.name);
  else startTask(chip.dataset.name);
});
$("weekGrid").addEventListener("click", e => {
  const card = e.target.closest("[data-date]");
  if (!card) return;
  $("selectedDate").value = card.dataset.date;
  render();
});
$("loadEodBtn").addEventListener("click", loadEodFromDb);
$("addEodRowBtn").addEventListener("click", addEodRow);
$("copyEodBtn").addEventListener("click", copyEodRows);
$("eodBody").addEventListener("input", onEodFieldInput);
$("eodBody").addEventListener("focusout", onEodHoursBlur);
$("clearDbBtn").addEventListener("click", clearDb);
$("downloadDbBtn").addEventListener("click", downloadDb);
$("uploadDbBtn").addEventListener("click", chooseBackupFile);
$("uploadDbInput").addEventListener("change", e => {
  const file = e.target.files && e.target.files[0];
  uploadDb(file);
});
$("cancelEdit").addEventListener("click", closeModal);
$("saveEdit").addEventListener("click", saveEdit);
$("editModal").addEventListener("click", e => {
  if (e.target === $("editModal")) closeModal();
});

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn || btn.disabled) return;
  const { action, id } = btn.dataset;
  if (action === "stop") stopTask(id);
  if (action === "restart") restartTask(id);
  if (action === "edit") editTask(id);
  if (action === "delete") removeTask(id);
  if (action === "eod-merge") mergeEodHours(Number(btn.dataset.index));
  if (action === "eod-split") splitEodHours(Number(btn.dataset.index));
  if (action === "eod-delete") deleteEodRow(Number(btn.dataset.index));
});

function bindEditKeys(id) {
  $(id).addEventListener("keydown", e => {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") closeModal();
  });
}
bindEditKeys("editName");
bindEditKeys("editHours");
bindEditKeys("editMinutes");

setInterval(updateLiveDurations, 1000);

(async function init() {
  $("selectedDate").value = localDateString();
  try {
    await openDb();
    await refresh();
  } catch (err) {
    console.error(err);
    await askConfirm({
      title: "Storage unavailable",
      message: "Could not open IndexedDB in this browser.",
      okLabel: "OK"
    });
  }
})();

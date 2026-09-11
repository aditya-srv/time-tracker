const $ = id => document.getElementById(id);

function selectedDate() {
  return $("selectedDate").value || localDateString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function trapFocus(container, e) {
  const nodes = [...container.querySelectorAll("button, input, textarea, select")].filter(el => !el.disabled && !el.hidden);
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function onEditModalKey(e) {
  if (e.key === "Escape") closeModal();
  if (e.key === "Tab") trapFocus($("editModal"), e);
}

function showEditError(message) {
  const el = $("editError");
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function askConfirm({ title, message, okLabel = "OK", danger = false, hideCancel = false }) {
  if (state.confirmCleanup) state.confirmCleanup();

  return new Promise(resolve => {
    $("confirmTitle").textContent = title;
    $("confirmMessage").textContent = message;
    $("confirmOk").textContent = okLabel;
    $("confirmOk").className = danger ? "danger" : "primary";
    $("confirmCancel").hidden = hideCancel;
    $("confirmModal").classList.add("show");

    const done = value => {
      state.confirmCleanup = null;
      $("confirmModal").classList.remove("show");
      $("confirmOk").removeEventListener("click", onOk);
      $("confirmCancel").removeEventListener("click", onCancel);
      $("confirmModal").removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onOk = () => done(true);
    const onCancel = () => done(false);
    const onBackdrop = e => { if (e.target === $("confirmModal")) done(false); };
    const onKey = e => {
      if (e.key === "Escape") done(false);
      if (e.key === "Tab") trapFocus($("confirmModal"), e);
    };

    state.confirmCleanup = () => done(false);
    $("confirmOk").addEventListener("click", onOk);
    $("confirmCancel").addEventListener("click", onCancel);
    $("confirmModal").addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    $("confirmOk").focus();
  });
}

function recentNames() {
  const seen = new Set();
  const names = [];
  const sorted = [...state.tasks].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  for (const t of sorted) {
    if (!t.name || seen.has(t.name)) continue;
    seen.add(t.name);
    names.push(t.name);
    if (names.length === 6) break;
  }
  return names;
}

function render() {
  const date = selectedDate();
  const today = localDateString();
  const visible = state.tasks
    .filter(t => daySegmentMs(t, date) > 0)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  const dayMs = dayTotalMs(state.tasks, date);
  const weekMs = weekTotalMs(state.tasks, date);
  $("dayTotal").textContent = formatDuration(dayMs);
  $("dayBar").style.width = `${workdayPct(dayMs)}%`;
  $("dayMeta").textContent = goalLabel(dayMs, 8);
  $("taskCount").textContent = visible.length;
  $("weekTotal").textContent = formatDuration(weekMs);
  $("weekBar").style.width = `${weekGoalPct(weekMs)}%`;
  $("weekMeta").textContent = goalLabel(weekMs, 48);
  $("dateTitle").textContent = formatDate(date);

  const running = runningTask();
  $("startControls").classList.toggle("is-tracking", Boolean(running));
  $("startBtn").disabled = Boolean(running);
  $("startBtn").textContent = running ? "Task Running..." : "Start Task";
  $("startBtn").title = running ? `Stop "${running.name}" before starting another task.` : "";

  const banner = $("viewingBanner");
  if (date === today) {
    banner.hidden = true;
    banner.textContent = "";
  } else {
    banner.hidden = false;
    banner.textContent = `Viewing ${formatDate(date)}. Start still tracks today. Logged hours are saved to this date.`;
  }

  const todayBtn = $("todayBtn");
  todayBtn.disabled = date === today;
  todayBtn.classList.toggle("is-current", date === today);

  renderRecent();
  renderRunningHero(running);
  renderTasks(visible, date, Boolean(running));
  renderWeek(date, today);
  syncAndRenderEod(date);
}

function renderRecent() {
  const names = recentNames();
  const el = $("recentTasks");
  if (!names.length) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  el.hidden = false;
  el.innerHTML = `<span class="recent-label">Recent</span>` + names.map(name => `
    <button type="button" class="chip" data-name="${escapeHtml(name)}">
      ${escapeHtml(name)}
    </button>
  `).join("");
}

function renderRunningHero(running) {
  const el = $("runningHero");
  if (!running) {
    el.hidden = true;
    el.innerHTML = "";
    return;
  }

  const started = running.startedAt
    ? new Date(running.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  el.hidden = false;
  el.innerHTML = `
    <div class="hero-label">Now tracking</div>
    <div class="hero-row">
      <div class="hero-copy">
        <div class="hero-name">${escapeHtml(running.name)}</div>
        <div class="hero-time">${started ? `Started ${started}` : "In progress"}</div>
      </div>
      <div class="hero-duration" data-hero-clock aria-live="polite">${formatClock(durationMs(running))}</div>
      <button type="button" class="primary" data-action="stop" data-id="${running.id}">Stop</button>
    </div>
  `;
}

function renderTasks(visible, date, isBusy) {
  if (!visible.length) {
    $("taskList").innerHTML = `
      <div class="empty">
        <strong>No tracked work for this date.</strong>
        Start a task or log hours above.
      </div>`;
    return;
  }

  $("taskList").innerHTML = visible.map(t => {
    const isRunning = t.stoppedAt == null && t.manualDurationMs == null;
    const ms = daySegmentMs(t, date);
    const isManual = t.manualDurationMs != null;
    const start = t.startedAt ? new Date(t.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Logged";
    const end = t.stoppedAt ? new Date(t.stoppedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (isRunning ? "Running" : "—");
    const timeRange = t.startedAt ? `${start} → ${end}` : "Logged";
    const editable = t.manualDurationMs != null || t.stoppedAt != null;

    return `
      <div class="task ${isRunning ? "running" : ""}">
        <div class="task-main">
          <div>
            <div class="task-name">${escapeHtml(t.name)}
              ${isRunning ? `<span class="status">● Running</span>` : ""}
              ${isManual ? `<span class="badge">Manual</span>` : ""}
            </div>
            <div class="task-time">${timeRange}</div>
          </div>
          <div class="task-duration" data-running-id="${isRunning ? t.id : ""}">${isRunning ? formatClock(ms) : formatDuration(ms)}</div>
        </div>
        <div class="task-bar ${ms === 0 ? "is-empty" : ""}"><span data-task-bar="${t.id}" style="width:${workdayPct(ms)}%"></span></div>
        <div class="task-actions">
          ${!isRunning ? `<button type="button" class="small primary" data-action="restart" data-id="${t.id}" ${isBusy ? "disabled" : ""}>Restart</button>` : ""}
          ${editable ? `<button type="button" class="small ghost" data-action="edit" data-id="${t.id}">Edit</button>` : ""}
          <button type="button" class="small danger quiet" data-action="delete" data-id="${t.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderWeek(selected, today) {
  const monday = mondayOf(parseDateOnly(selected));
  const cards = [];

  for (let i = 0; i < 6; i++) {
    const d = addDays(monday, i);
    const ds = localDateString(d);
    const ms = dayTotalMs(state.tasks, ds);
    const pct = workdayPct(ms);
    const isToday = ds === today;
    const isSelected = ds === selected;
    cards.push(`
      <button type="button" class="week-card ${isSelected ? "selected" : ""} ${ms === 0 ? "zero" : ""}" data-date="${ds}">
        <div class="week-day">
          ${d.toLocaleDateString(undefined, { weekday: "long" })}
          ${isToday ? `<span class="week-tag">Today</span>` : ""}
        </div>
        <div class="week-hours" data-week-hours="${ds}">${formatDuration(ms)}</div>
        <div class="week-bar"><span data-week-bar="${ds}" style="width:${pct}%"></span></div>
      </button>
    `);
  }

  $("weekGrid").innerHTML = cards.join("");

  const weekEnd = addDays(monday, 5);
  $("weekRange").textContent = `${monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function newEodRow(name = "", hours = 0) {
  return { id: crypto.randomUUID(), name, hours: roundToQuarter(hours), span: 1 };
}

function buildEodRows(date) {
  const order = [];
  const hoursByName = new Map();
  const visible = state.tasks
    .filter(t => daySegmentMs(t, date) > 0)
    .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));

  for (const t of visible) {
    const name = t.name;
    if (!hoursByName.has(name)) {
      hoursByName.set(name, 0);
      order.push(name);
    }
    hoursByName.set(name, hoursByName.get(name) + daySegmentMs(t, date) / 3600000);
  }

  return order.map(name => newEodRow(name, hoursByName.get(name)));
}

function eodOwnerIndex(index) {
  const rows = state.eod.rows;
  if (rows[index] && rows[index].span > 0) return index;
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i].span > 0 && i + rows[i].span > index) return i;
  }
  return index;
}

function eodGroupHours(index) {
  const owner = eodOwnerIndex(index);
  const row = state.eod.rows[owner];
  const span = row && row.span > 0 ? row.span : 1;
  let sum = 0;
  for (let i = owner; i < owner + span; i++) sum += Number(state.eod.rows[i].hours) || 0;
  return roundToQuarter(sum);
}

function eodTotalHours() {
  return roundToQuarter(state.eod.rows.reduce((sum, row) => sum + roundToQuarter(Number(row.hours) || 0), 0));
}

function updateEodTotal() {
  $("eodTotal").textContent = formatQuarterHours(eodTotalHours());
}

function persistEodDraft() {
  if (!state.eod.date) return;
  state.eodDrafts[state.eod.date] = {
    dirty: state.eod.dirty,
    rows: state.eod.rows
  };
}

function syncAndRenderEod(date) {
  if (state.eod.date && state.eod.date !== date) persistEodDraft();

  if (state.eod.date === date && state.eod.dirty) {
    $("eodDateLabel").textContent = formatDate(date);
    return;
  }

  if (state.eod.date !== date) {
    const draft = state.eodDrafts[date];
    state.eod.date = date;
    if (draft && draft.dirty) {
      state.eod.dirty = true;
      state.eod.rows = draft.rows;
    } else {
      state.eod.dirty = false;
      state.eod.rows = buildEodRows(date);
    }
  } else if (!state.eod.dirty) {
    state.eod.rows = buildEodRows(date);
  }

  renderEodTable();
}

function renderEodTable() {
  const date = state.eod.date || selectedDate();
  $("eodDateLabel").textContent = formatDate(date);

  const rows = state.eod.rows;
  if (!rows.length) {
    $("eodBody").innerHTML = `
      <tr>
        <td colspan="2" class="eod-empty">No tasks for this date. Add a row to start the EOD table.</td>
      </tr>`;
    updateEodTotal();
    return;
  }

  $("eodBody").innerHTML = rows.map((row, index) => {
    const nameCell = `
      <td>
        <div class="eod-name">
          <input data-field="name" data-index="${index}" type="text" value="${escapeHtml(row.name)}" placeholder="Task name" autocomplete="off" />
          <button type="button" class="small danger quiet" data-action="eod-delete" data-index="${index}" title="Remove row">×</button>
        </div>
      </td>`;

    if (row.span === 0) {
      return `<tr data-index="${index}">${nameCell}</tr>`;
    }

    const span = row.span || 1;
    const nextIndex = index + span;
    const canMerge = nextIndex < rows.length && rows[nextIndex].span > 0;
    const hours = formatQuarterHours(eodGroupHours(index));
    const hrsCell = `
      <td class="hrs ${span > 1 ? "is-merged" : ""}" rowspan="${span}">
        <div class="eod-hrs">
          <input data-field="hours" data-index="${index}" type="number" min="0" step="0.25" inputmode="decimal" value="${escapeHtml(hours)}" />
          <div class="eod-hrs-actions">
            ${canMerge ? `<button type="button" class="small ghost" data-action="eod-merge" data-index="${index}" title="Merge hours with the next row">Merge ↓</button>` : ""}
            ${span > 1 ? `<button type="button" class="small ghost" data-action="eod-split" data-index="${index}" title="Unmerge hours">Split</button>` : ""}
          </div>
        </div>
      </td>`;

    return `<tr data-index="${index}">${nameCell}${hrsCell}</tr>`;
  }).join("");

  updateEodTotal();
}

async function loadEodFromDb() {
  flushEodHoursInput();
  const date = selectedDate();
  state.tasks = await getAllTasks();
  state.eod.date = date;
  state.eod.dirty = false;
  state.eod.rows = buildEodRows(date);
  delete state.eodDrafts[date];
  render();
}

function addEodRow() {
  flushEodHoursInput();
  state.eod.dirty = true;
  if (!state.eod.date) state.eod.date = selectedDate();
  state.eod.rows.push(newEodRow());
  persistEodDraft();
  renderEodTable();
  const inputs = $("eodBody").querySelectorAll('input[data-field="name"]');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
}

function mergeEodHours(index) {
  flushEodHoursInput();
  const rows = state.eod.rows;
  const row = rows[index];
  if (!row || row.span < 1) return;
  const nextIndex = index + row.span;
  const next = rows[nextIndex];
  if (!next || next.span < 1) return;
  state.eod.dirty = true;
  row.span += next.span;
  next.span = 0;
  persistEodDraft();
  renderEodTable();
}

function splitEodHours(index) {
  flushEodHoursInput();
  const rows = state.eod.rows;
  const row = rows[index];
  if (!row || row.span <= 1) return;
  state.eod.dirty = true;
  for (let i = index + 1; i < index + row.span; i++) rows[i].span = 1;
  row.span = 1;
  persistEodDraft();
  renderEodTable();
}

function deleteEodRow(index) {
  flushEodHoursInput();
  const rows = state.eod.rows;
  if (!rows[index]) return;
  state.eod.dirty = true;
  const owner = eodOwnerIndex(index);
  if (rows[owner].span > 1) {
    if (index === owner) rows[index + 1].span = rows[owner].span - 1;
    else rows[owner].span -= 1;
  }
  rows.splice(index, 1);
  persistEodDraft();
  renderEodTable();
}

function parseEodHours(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function setEodGroupHours(ownerIndex, hours, round) {
  const rows = state.eod.rows;
  const span = rows[ownerIndex] && rows[ownerIndex].span > 0 ? rows[ownerIndex].span : 1;
  const nextHours = round ? roundToQuarter(Math.max(0, hours)) : Math.max(0, hours);

  if (span === 1) {
    rows[ownerIndex].hours = nextHours;
    return;
  }

  let current = 0;
  for (let i = ownerIndex; i < ownerIndex + span; i++) current += Number(rows[i].hours) || 0;

  if (current <= 0) {
    rows[ownerIndex].hours = nextHours;
    for (let i = ownerIndex + 1; i < ownerIndex + span; i++) rows[i].hours = 0;
    return;
  }

  let assigned = 0;
  for (let i = ownerIndex; i < ownerIndex + span; i++) {
    if (i === ownerIndex + span - 1) {
      rows[i].hours = round ? roundToQuarter(nextHours - assigned) : nextHours - assigned;
    } else {
      const share = (Number(rows[i].hours) || 0) * (nextHours / current);
      rows[i].hours = round ? roundToQuarter(share) : share;
      assigned += rows[i].hours;
    }
  }
}

function liveEodTotal(ownerIndex, liveHours) {
  const rows = state.eod.rows;
  const owner = eodOwnerIndex(ownerIndex);
  const span = rows[owner] && rows[owner].span > 0 ? rows[owner].span : 1;
  let sum = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i >= owner && i < owner + span) continue;
    sum += Number(rows[i].hours) || 0;
  }
  return roundToQuarter(sum + liveHours);
}

function onEodFieldInput(e) {
  const input = e.target.closest("input[data-field]");
  if (!input) return;
  const index = Number(input.dataset.index);
  const row = state.eod.rows[index];
  if (!row) return;
  state.eod.dirty = true;
  if (input.dataset.field === "name") {
    row.name = input.value;
    persistEodDraft();
    return;
  }
  if (input.dataset.field === "hours") {
    if ((row.span || 1) === 1) {
      row.hours = parseEodHours(input.value);
      persistEodDraft();
      updateEodTotal();
    } else {
      $("eodTotal").textContent = formatQuarterHours(liveEodTotal(index, parseEodHours(input.value)));
    }
  }
}

function commitEodHoursInput(input) {
  if (!input || input.dataset.field !== "hours") return;
  const index = Number(input.dataset.index);
  if (!state.eod.rows[index]) return;
  state.eod.dirty = true;
  setEodGroupHours(index, parseEodHours(input.value), true);
  persistEodDraft();
  input.value = formatQuarterHours(eodGroupHours(index));
  updateEodTotal();
}

function flushEodHoursInput() {
  const input = document.activeElement;
  if (input && input.dataset && input.dataset.field === "hours") commitEodHoursInput(input);
}

function onEodHoursBlur(e) {
  commitEodHoursInput(e.target.closest('input[data-field="hours"]'));
}

function eodPlainText() {
  const rows = state.eod.rows;
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row.name;
    if (row.span > 0) lines.push(`${name}\t${formatQuarterHours(eodGroupHours(i))}`);
    else lines.push(`${name}\t`);
  }
  return lines.join("\n");
}

function eodHtmlTable() {
  const rows = state.eod.rows;
  const body = rows.map((row, index) => {
    const name = escapeHtml(row.name);
    if (row.span === 0) return `<tr><td>${name}</td></tr>`;
    const span = row.span || 1;
    const hours = escapeHtml(formatQuarterHours(eodGroupHours(index)));
    const spanAttr = span > 1 ? ` rowspan="${span}"` : "";
    return `<tr><td>${name}</td><td${spanAttr}>${hours}</td></tr>`;
  }).join("");
  return `<table border="1" cellspacing="0" cellpadding="4">${body}</table>`;
}

async function copyEodRows() {
  flushEodHoursInput();
  const text = eodPlainText();
  const html = `<!--StartFragment-->${eodHtmlTable()}<!--EndFragment-->`;
  const btn = $("copyEodBtn");
  const resetLabel = () => { btn.textContent = "Copy rows"; };

  if (!state.eod.rows.length) {
    btn.textContent = "Nothing to copy";
    setTimeout(resetLabel, 1400);
    return;
  }

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })
      ]);
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      throw new Error("clipboard unavailable");
    }
    btn.textContent = "Copied";
  } catch {
    const probe = document.createElement("textarea");
    probe.value = text;
    document.body.appendChild(probe);
    probe.select();
    try {
      document.execCommand("copy");
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy failed";
    }
    probe.remove();
  }
  setTimeout(resetLabel, 1400);
}

function updateLiveDurations() {
  const running = runningTask();
  if (!running) return;

  const date = selectedDate();
  const today = localDateString();
  const clock = document.querySelector("[data-hero-clock]");
  if (clock) clock.textContent = formatClock(durationMs(running));

  const listDur = document.querySelector(`[data-running-id="${running.id}"]`);
  if (listDur) listDur.textContent = formatClock(daySegmentMs(running, date));

  const dayMs = dayTotalMs(state.tasks, date);
  const weekMs = weekTotalMs(state.tasks, date);
  $("dayTotal").textContent = formatDuration(dayMs);
  $("dayBar").style.width = `${workdayPct(dayMs)}%`;
  $("dayMeta").textContent = goalLabel(dayMs, 8);
  $("weekTotal").textContent = formatDuration(weekMs);
  $("weekBar").style.width = `${weekGoalPct(weekMs)}%`;
  $("weekMeta").textContent = goalLabel(weekMs, 48);

  const todayHours = document.querySelector(`[data-week-hours="${today}"]`);
  const todayBar = document.querySelector(`[data-week-bar="${today}"]`);
  const todayMs = dayTotalMs(state.tasks, today);
  if (todayHours) todayHours.textContent = formatDuration(todayMs);
  if (todayBar) todayBar.style.width = `${workdayPct(todayMs)}%`;

  const taskBar = document.querySelector(`[data-task-bar="${running.id}"]`);
  if (taskBar) taskBar.style.width = `${workdayPct(daySegmentMs(running, date))}%`;
}

function openEditModal(task) {
  state.editingTaskId = task.id;
  const totalMinutes = Math.floor(Math.max(0, durationMs(task)) / 60000);
  $("editName").value = task.name;
  $("editHours").value = Math.floor(totalMinutes / 60);
  $("editMinutes").value = totalMinutes % 60;
  showEditError("");
  $("editModal").classList.add("show");
  document.removeEventListener("keydown", onEditModalKey);
  document.addEventListener("keydown", onEditModalKey);
  $("editName").focus();
  $("editName").select();
}

function closeModal() {
  state.editingTaskId = null;
  showEditError("");
  $("editModal").classList.remove("show");
  document.removeEventListener("keydown", onEditModalKey);
}

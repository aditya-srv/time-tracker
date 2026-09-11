const WORKDAY_MS = 8 * 3600000;

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnly(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(s) {
  return parseDateOnly(s).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });
}

function formatDuration(ms) {
  ms = Math.max(0, ms || 0);
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatClock(ms) {
  ms = Math.max(0, ms || 0);
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function durationMs(task) {
  // An hours edit always replaces the total. Check it first so clock times
  // and prior accumulated sessions cannot override the edited value.
  if (task.manualDurationMs != null) return task.manualDurationMs;
  if (task.accumulatedDurationMs != null) {
    const current = task.startedAt ? Math.max(0, (task.stoppedAt || Date.now()) - task.startedAt) : 0;
    return task.accumulatedDurationMs + current;
  }
  if (!task.startedAt) return 0;
  const end = task.stoppedAt ? task.stoppedAt : Date.now();
  return Math.max(0, end - task.startedAt);
}

function dayBounds(dateStr) {
  const start = parseDateOnly(dateStr);
  return { start: start.getTime(), end: addDays(start, 1).getTime() };
}

function overlapMs(rangeStart, rangeEnd, dayStart, dayEnd) {
  return Math.max(0, Math.min(rangeEnd, dayEnd) - Math.max(rangeStart, dayStart));
}

function daySegmentMs(task, dateStr) {
  const { start: dayStart, end: dayEnd } = dayBounds(dateStr);

  // Manually edited task: attribute the edited total to the task's date.
  if (task.manualDurationMs != null) {
    return task.date === dateStr ? task.manualDurationMs : 0;
  }

  // A restarted task keeps its previous tracked time and adds the new segment.
  if (task.accumulatedDurationMs != null) {
    const current = task.startedAt
      ? overlapMs(task.startedAt, task.stoppedAt || Date.now(), dayStart, dayEnd)
      : 0;
    const previous = task.date === dateStr ? task.accumulatedDurationMs : 0;
    return previous + current;
  }

  if (!task.startedAt) return 0;

  return overlapMs(task.startedAt, task.stoppedAt || Date.now(), dayStart, dayEnd);
}

function formatClockTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatTaskTimeRange(task, dateStr) {
  if (!task.startedAt) return "Logged";
  const { start: dayStart, end: dayEnd } = dayBounds(dateStr);
  const liveEnd = task.stoppedAt || Date.now();
  const overlapStart = Math.max(task.startedAt, dayStart);
  const overlapEnd = Math.min(liveEnd, dayEnd);
  if (overlapEnd <= overlapStart) return "Logged";
  const startLabel = formatClockTime(overlapStart);
  const now = Date.now();
  const stillInThisDay = task.stoppedAt == null && task.manualDurationMs == null && now >= dayStart && now < dayEnd;
  const endLabel = stillInThisDay ? "Running" : formatClockTime(overlapEnd);
  return `${startLabel} → ${endLabel}`;
}

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function dayTotalMs(tasks, date) {
  return tasks.reduce((sum, t) => sum + daySegmentMs(t, date), 0);
}

function weekTotalMs(tasks, selected) {
  const monday = mondayOf(parseDateOnly(selected));
  let total = 0;
  for (let i = 0; i < 6; i++) {
    total += dayTotalMs(tasks, localDateString(addDays(monday, i)));
  }
  return total;
}

function workdayPct(ms) {
  return Math.min(100, (Math.max(0, ms) / WORKDAY_MS) * 100);
}

function weekGoalPct(ms) {
  return Math.min(100, (Math.max(0, ms) / (WORKDAY_MS * 6)) * 100);
}

function goalLabel(ms, hours) {
  const pct = Math.round((Math.max(0, ms) / (hours * 3600000)) * 100);
  return `${Math.min(pct, 999)}% of ${hours}h`;
}

function roundToQuarter(hours) {
  return Math.round((Number(hours) || 0) * 4) / 4;
}

function formatQuarterHours(hours) {
  const n = roundToQuarter(hours);
  if (Object.is(n, -0)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

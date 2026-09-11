const state = {
  tasks: [],
  editingTaskId: null,
  confirmCleanup: null,
  dbReady: false,
  startInFlight: false,
  eod: {
    date: null,
    dirty: false,
    rows: []
  },
  eodDrafts: {}
};

function isRunningTask(task) {
  return Boolean(task) && task.stoppedAt == null && task.manualDurationMs == null;
}

function runningTask() {
  return state.tasks.find(isRunningTask) || null;
}

const state = {
  tasks: [],
  editingTaskId: null,
  confirmCleanup: null,
  eod: {
    date: null,
    dirty: false,
    rows: []
  },
  eodDrafts: {}
};

function runningTask() {
  return state.tasks.find(t => t.stoppedAt == null && t.manualDurationMs == null) || null;
}

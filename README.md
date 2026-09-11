# time-tracker

Local task timer. Data is stored in the browser (IndexedDB) and never sent to a server.

## Database

| | |
| --- | --- |
| Engine | IndexedDB |
| Database name | `task-tracker-db` |
| Version | `1` |
| Object store | `tasks` |
| Key | `id` |
| Index | `date` (non-unique) |

Each record in `tasks`:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | UUID |
| `name` | string | Task title |
| `date` | string | Local calendar day, `YYYY-MM-DD` |
| `startedAt` | number \| null | Unix ms when the timer started. `null` for logged (manual) tasks |
| `stoppedAt` | number \| null | Unix ms when the timer stopped. `null` while running |
| `manualDurationMs` | number \| null | Fixed duration in ms. Set for logged or edited tasks |
| `accumulatedDurationMs` | number \| null | Prior session total in ms, used when a task is resumed |

A running task has `stoppedAt: null` and `manualDurationMs: null`. A logged task has `startedAt: null` and a `manualDurationMs` value.

## Import / export

**Data → Download backup** writes this JSON. **Data → Upload backup** reads the same shape and replaces all stored tasks.

A raw array of task objects is also accepted on import.

```json
{
  "app": "task-tracker",
  "version": 1,
  "exportedAt": "2026-09-11T13:35:00.000Z",
  "tasks": [
    {
      "id": "a1b2c3d4-e5f6-7890-ab12-cd3456789001",
      "name": "B2B Sales list – Invoice PDF generation",
      "date": "2026-09-11",
      "startedAt": null,
      "stoppedAt": 1757596500000,
      "manualDurationMs": 5400000,
      "accumulatedDurationMs": null
    }
  ]
}
```

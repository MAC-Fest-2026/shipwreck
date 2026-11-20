import { openDB, type DBSchema } from 'idb'
import type { RunRecord } from '../game/score'

interface Database extends DBSchema {
  runs: { key: string; value: RunRecord }
}

export class ScoreRepository {
  private database: ReturnType<typeof openDB<Database>> | null = null
  private get db() {
    return this.database ??= openDB<Database>('shipwreck-scorebook', 1, {
      upgrade(database) { database.createObjectStore('runs', { keyPath: 'runId' }) },
    }).catch(error => { this.database = null; throw error })
  }
  async saveRun(run: RunRecord) {
    try { await (await this.db).add('runs', run) }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'ConstraintError')) throw error
    }
  }
  async listRuns() { return (await (await this.db).getAll('runs')).sort(orderScores) }
  async listPlayers() { return [...new Set((await this.listRuns()).map(run => run.player.callsign))] }
  async clearAll() { await (await this.db).clear('runs') }
}

export const orderScores = (a: RunRecord, b: RunRecord) =>
  b.score - a.score || a.time.totalActiveMs - b.time.totalActiveMs || a.startedAt.localeCompare(b.startedAt)

export function toCsv(runs: RunRecord[]) {
  const escape = (value: string | number) => '"' + String(value).replaceAll('"', '""') + '"'
  return ['callsign,score,rank,totalActiveMs,rescueMs,boatMs,saved,lost,hull,outcome,startedAt,mode,seed', ...runs.map(r => [
    r.player.callsign, r.score, r.rank, r.time.totalActiveMs, r.time.rescueMs, r.time.boatMs,
    r.survivors.saved, r.survivors.lost, r.stats.hullRemaining, r.outcome, r.startedAt, r.settings.inputMode, r.seed,
  ].map(escape).join(','))].join('\r\n')
}

export function downloadRuns(runs: RunRecord[], format: 'csv' | 'json') {
  const blob = new Blob([format === 'csv' ? toCsv(runs) : JSON.stringify(runs, null, 2)], {
    type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json',
  })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = 'shipwreck-runs.' + format
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 1800)
}

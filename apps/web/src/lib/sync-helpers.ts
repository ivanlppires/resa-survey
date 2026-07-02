import type { SyncPayload, SyncResult, SyncSurvey } from '@resa/shared'
import type { LocalSurvey, LocalResponse } from './db'

export function buildSyncPayload(
  pending: LocalSurvey[],
  responsesByLocalId: Map<string, LocalResponse[]>,
  deviceInfo: string,
  syncedAt: string,
): SyncPayload {
  const surveys: SyncSurvey[] = pending.map((s) => ({
    metadata: {
      localId: s.localId,
      settlementId: s.settlementId,
      lotNumber: s.lotNumber || null,
      gpsLat: s.gpsLat,
      gpsLng: s.gpsLng,
      status: s.status,
      deviceInfo: s.deviceInfo || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      completedAt: s.completedAt,
    },
    responses: (responsesByLocalId.get(s.localId) ?? []).map((r) => ({
      questionKey: r.questionKey,
      value: r.value,
      textValue: r.textValue ?? null,
      answeredAt: r.answeredAt,
    })),
  }))
  return { surveys, deviceInfo, syncedAt }
}

export interface SyncOutcome {
  syncedLocalIds: string[]
  failedLocalIds: string[]
}

export function resolveSyncOutcome(pendingLocalIds: string[], result: SyncResult): SyncOutcome {
  const confirmed = new Set(result.syncedLocalIds)
  return {
    syncedLocalIds: pendingLocalIds.filter((id) => confirmed.has(id)),
    failedLocalIds: pendingLocalIds.filter((id) => !confirmed.has(id)),
  }
}

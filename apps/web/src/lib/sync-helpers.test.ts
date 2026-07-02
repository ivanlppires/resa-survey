import { describe, it, expect } from 'vitest'
import { buildSyncPayload, resolveSyncOutcome } from './sync-helpers'
import type { LocalSurvey, LocalResponse } from './db'

const survey: LocalSurvey = {
  id: 1,
  localId: 'uuid-1',
  settlementId: 3,
  settlementName: 'PA Teste',
  lotNumber: '42',
  gpsLat: -16.1,
  gpsLng: -57.7,
  status: 'completed',
  deviceInfo: 'ua',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T11:00:00.000Z',
  completedAt: '2026-07-01T11:00:00.000Z',
  syncedAt: null,
}

const responses: LocalResponse[] = [
  { id: 1, surveyLocalId: 'uuid-1', questionKey: 'q66', value: ['outros'], textValue: 'voçoroca', answeredAt: '2026-07-01T10:30:00.000Z' },
  { id: 2, surveyLocalId: 'uuid-1', questionKey: 'q01', value: '21_30', answeredAt: '2026-07-01T10:05:00.000Z' },
]

describe('buildSyncPayload', () => {
  it('maps localId, settlementId and textValue into the contract', () => {
    const payload = buildSyncPayload([survey], new Map([['uuid-1', responses]]), 'ua', '2026-07-01T12:00:00.000Z')
    expect(payload.surveys).toHaveLength(1)
    expect(payload.surveys[0].metadata.localId).toBe('uuid-1')
    expect(payload.surveys[0].metadata.settlementId).toBe(3)
    expect(payload.surveys[0].responses[0].textValue).toBe('voçoroca')
    expect(payload.surveys[0].responses[1].textValue).toBeNull()
    expect(payload.deviceInfo).toBe('ua')
  })

  it('sends empty responses array when none exist', () => {
    const payload = buildSyncPayload([survey], new Map(), 'ua', '2026-07-01T12:00:00.000Z')
    expect(payload.surveys[0].responses).toEqual([])
  })
})

describe('resolveSyncOutcome', () => {
  it('splits pending ids into confirmed and failed', () => {
    const outcome = resolveSyncOutcome(['a', 'b', 'c'], { syncedLocalIds: ['a', 'c'], errors: [{ localId: 'b', message: 'FK' }] })
    expect(outcome.syncedLocalIds).toEqual(['a', 'c'])
    expect(outcome.failedLocalIds).toEqual(['b'])
  })

  it('treats an empty server response as all-failed (never marks blindly)', () => {
    const outcome = resolveSyncOutcome(['a'], { syncedLocalIds: [], errors: [] })
    expect(outcome.syncedLocalIds).toEqual([])
    expect(outcome.failedLocalIds).toEqual(['a'])
  })
})

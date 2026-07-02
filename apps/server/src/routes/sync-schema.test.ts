import { describe, it, expect } from 'vitest'
import { syncPayloadSchema } from './sync-schema.js'

const base = {
  deviceInfo: 'test-device',
  syncedAt: '2026-07-01T12:00:00.000Z',
}

const metadata = {
  localId: 'uuid-1',
  settlementId: 1,
  lotNumber: '42',
  gpsLat: -15.5,
  gpsLng: -56.1,
  status: 'completed',
  deviceInfo: 'test-device',
  createdAt: '2026-07-01T10:00:00.000Z',
  updatedAt: '2026-07-01T11:00:00.000Z',
  completedAt: '2026-07-01T11:00:00.000Z',
}

describe('syncPayloadSchema', () => {
  it('accepts the new contract with localId and textValue', () => {
    const parsed = syncPayloadSchema.parse({
      ...base,
      surveys: [{
        metadata,
        responses: [{ questionKey: 'q66_problemas_ambientais', value: ['outros'], textValue: 'voçoroca', answeredAt: '2026-07-01T10:30:00.000Z' }],
      }],
    })
    expect(parsed.surveys[0].metadata.localId).toBe('uuid-1')
    expect(parsed.surveys[0].responses[0].textValue).toBe('voçoroca')
  })

  it('accepts legacy payloads without localId and textValue', () => {
    const { localId: _omit, ...legacyMeta } = metadata
    const parsed = syncPayloadSchema.parse({
      ...base,
      surveys: [{
        metadata: legacyMeta,
        responses: [{ questionKey: 'q01_idade', value: '21_30', answeredAt: '2026-07-01T10:05:00.000Z' }],
      }],
    })
    expect(parsed.surveys[0].metadata.localId).toBeUndefined()
    expect(parsed.surveys[0].responses[0].textValue).toBeUndefined()
  })

  it('rejects a survey without settlementId', () => {
    const { settlementId: _omit, ...noSettlement } = metadata
    expect(() => syncPayloadSchema.parse({ ...base, surveys: [{ metadata: noSettlement, responses: [] }] })).toThrow()
  })
})

import { z } from 'zod'

export const syncPayloadSchema = z.object({
  surveys: z.array(z.object({
    metadata: z.object({
      localId: z.string().min(1).optional(),
      settlementId: z.number(),
      lotNumber: z.string().nullable().optional(),
      gpsLat: z.number().nullable().optional(),
      gpsLng: z.number().nullable().optional(),
      status: z.enum(['draft', 'in_progress', 'completed', 'synced']),
      deviceInfo: z.string().nullable().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
      completedAt: z.string().nullable().optional(),
    }),
    responses: z.array(z.object({
      questionKey: z.string(),
      value: z.any(),
      textValue: z.string().nullable().optional(),
      answeredAt: z.string(),
    })),
  })),
  deviceInfo: z.string(),
  syncedAt: z.string(),
})

export type SyncPayloadInput = z.infer<typeof syncPayloadSchema>

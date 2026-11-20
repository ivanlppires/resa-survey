import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import Dexie from 'dexie'

const apiFetch = vi.fn()
vi.mock('./api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiError: class ApiError extends Error { status = 0 },
}))

const question = (id: number, key: string, version?: number) => ({
  id, key, number: id, text: key, type: 'single_choice', section: 'socioeconomic', options: null,
  scaleMin: null, scaleMax: null, conditional: null, sortOrder: id,
  ...(version === undefined ? {} : { version, groupKey: null, groupText: null, subsection: null, maxSelections: null }),
})
const survey = (localId: string, extra: Record<string, unknown> = {}) => ({
  localId, settlementId: 1, settlementName: 'PA Teste', lotNumber: '1', gpsLat: null, gpsLng: null,
  status: 'in_progress', deviceInfo: 'ua', createdAt: '2026-08-10T10:00:00.000Z', updatedAt: '2026-08-10T10:00:00.000Z',
  completedAt: null, syncedAt: null, ...extra,
})
const response = (surveyLocalId: string, questionKey: string) =>
  ({ surveyLocalId, questionKey, value: 'x', answeredAt: '2026-08-10T10:05:00.000Z' })

const V1 = [question(1, 'q01_idade', 1), question(2, 'q02_escolaridade', 1)]
const V2 = [question(101, 'v2_q01_idade', 2), question(102, 'v2_q02_escolaridade', 2)]

async function load() {
  vi.resetModules()
  const { db } = await import('./db')
  const sync = await import('./sync')
  return { db, ...sync }
}

/** Banco local novo e vazio (cada teste começa como um celular recém-instalado). */
function freshIndexedDb() {
  globalThis.indexedDB = new IDBFactory()
  Dexie.dependencies.indexedDB = globalThis.indexedDB
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
}

beforeEach(() => {
  freshIndexedDb()
  apiFetch.mockReset()
})

describe('migração do banco local para o questionário versionado', () => {
  /** Banco como o app antigo deixou: schema v2 do Dexie, sem campos de versão. */
  async function seedLegacyDb(fill: (legacy: Dexie) => Promise<void>) {
    const legacy = new Dexie('resa-survey')
    legacy.version(1).stores({
      questions: 'id, key, section, sortOrder',
      surveys: '++id, localId, status, settlementId',
      responses: '++id, surveyLocalId, questionKey, [surveyLocalId+questionKey]',
    })
    legacy.version(2).stores({ settlements: 'id' })
    await legacy.open()
    await fill(legacy)
    legacy.close()
  }

  it('preserva rascunhos e respostas e marca tudo como v1', async () => {
    await seedLegacyDb(async (legacy) => {
      await legacy.table('questions').bulkAdd([question(1, 'q01_idade'), question(2, 'q02_escolaridade')])
      await legacy.table('surveys').bulkAdd([survey('com-respostas'), survey('vazio'), survey('concluida', { status: 'completed' })])
      await legacy.table('responses').bulkAdd([response('com-respostas', 'q01_idade'), response('concluida', 'q02_escolaridade')])
    })
    const { db } = await load()
    expect((await db.questions.toArray()).map((q) => q.version)).toEqual([1, 1])
    const surveys = await db.surveys.orderBy('localId').toArray()
    expect(surveys.map((s) => [s.localId, s.questionnaireVersion, s.status])).toEqual([
      ['com-respostas', 1, 'in_progress'], ['concluida', 1, 'completed'], ['vazio', 1, 'in_progress'],
    ])
    expect(await db.responses.count()).toBe(2)
  })

  it('banco antigo vazio abre sem erro', async () => {
    await seedLegacyDb(async () => {})
    const { db } = await load()
    expect(await db.surveys.count()).toBe(0)
  })
})

describe('syncQuestions', () => {
  it('baixa a vigente e mantém as perguntas de entrevista v1 não sincronizada', async () => {
    const { db, syncQuestions } = await load()
    await db.questions.bulkAdd(V1 as never)
    await db.surveys.add(survey('rascunho-v1', { questionnaireVersion: 1 }) as never)
    await db.responses.add(response('rascunho-v1', 'q01_idade') as never)
    apiFetch.mockResolvedValue(V2)

    await syncQuestions()

    expect(apiFetch).toHaveBeenCalledWith('/questions?version=current')
    expect((await db.questions.orderBy('id').toArray()).map((q) => q.key)).toEqual(
      ['q01_idade', 'q02_escolaridade', 'v2_q01_idade', 'v2_q02_escolaridade'],
    )
  })

  it('descarta a versão antiga quando só restam entrevistas sincronizadas', async () => {
    const { db, syncQuestions } = await load()
    await db.questions.bulkAdd(V1 as never)
    await db.surveys.add(survey('enviada', { questionnaireVersion: 1, status: 'synced' }) as never)
    apiFetch.mockResolvedValue(V2)
    await syncQuestions()
    expect((await db.questions.toArray()).map((q) => q.version)).toEqual([2, 2])
  })

  it('NÃO muda a versão de rascunho vazio (pode estar aberto na tela com as perguntas antigas)', async () => {
    const { db, syncQuestions } = await load()
    await db.questions.bulkAdd(V1 as never)
    await db.surveys.add(survey('vazio-aberto', { questionnaireVersion: 1 }) as never)
    apiFetch.mockResolvedValue(V2)

    await syncQuestions()

    expect((await db.surveys.where('localId').equals('vazio-aberto').first())!.questionnaireVersion).toBe(1)
    // e as perguntas v1 continuam disponíveis para ele
    expect(await db.questions.where('version').equals(1).count()).toBe(2)
  })

  it('substitui as perguntas da vigente sem duplicar', async () => {
    const { db, syncQuestions } = await load()
    await db.questions.bulkAdd([...V2, question(199, 'v2_removida', 2)] as never)
    apiFetch.mockResolvedValue(V2)
    await syncQuestions()
    expect((await db.questions.orderBy('id').toArray()).map((q) => q.key)).toEqual(['v2_q01_idade', 'v2_q02_escolaridade'])
  })

  it('sem rede o cache fica intacto', async () => {
    const { db, syncQuestions } = await load()
    await db.questions.bulkAdd(V1 as never)
    apiFetch.mockRejectedValue(new Error('offline'))
    await syncQuestions()
    expect(await db.questions.count()).toBe(2)
  })
})

describe('getQuestionsForVersion', () => {
  it('devolve só a versão pedida, em ordem, sem ir à rede', async () => {
    const { db, getQuestionsForVersion } = await load()
    await db.questions.bulkAdd([...V2, ...V1].reverse() as never)
    expect((await getQuestionsForVersion(1)).map((q) => q.key)).toEqual(['q01_idade', 'q02_escolaridade'])
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('versão fora do cache e sem rede → [] (nunca perguntas de outra versão)', async () => {
    const { db, getQuestionsForVersion } = await load()
    await db.questions.bulkAdd(V2 as never)
    apiFetch.mockRejectedValue(new Error('offline'))
    expect(await getQuestionsForVersion(1)).toEqual([])
  })

  it('versão fora do cache com rede → baixa e guarda', async () => {
    const { db, getQuestionsForVersion } = await load()
    apiFetch.mockResolvedValue(V1)
    expect((await getQuestionsForVersion(1)).map((q) => q.key)).toEqual(['q01_idade', 'q02_escolaridade'])
    expect(apiFetch).toHaveBeenCalledWith('/questions?version=1')
    expect(await db.questions.count()).toBe(2)
  })
})

describe('adoptCurrentVersionIfEmpty', () => {
  async function setup(extra: Record<string, unknown>, withResponse: boolean) {
    const ctx = await load()
    await ctx.db.questions.bulkAdd([...V1, ...V2] as never)
    await ctx.db.surveys.add(survey('s', { questionnaireVersion: 1, ...extra }) as never)
    if (withResponse) await ctx.db.responses.add(response('s', 'q01_idade') as never)
    return ctx
  }
  const versionOf = async (db: Awaited<ReturnType<typeof load>>['db']) =>
    (await db.surveys.where('localId').equals('s').first())!.questionnaireVersion

  it('rascunho sem nenhuma resposta passa para a versão vigente em cache', async () => {
    const { db, adoptCurrentVersionIfEmpty } = await setup({}, false)
    expect(await adoptCurrentVersionIfEmpty('s')).toBe(2)
    expect(await versionOf(db)).toBe(2)
  })
  it('rascunho com resposta fica na versão em que começou', async () => {
    const { db, adoptCurrentVersionIfEmpty } = await setup({}, true)
    expect(await adoptCurrentVersionIfEmpty('s')).toBe(1)
    expect(await versionOf(db)).toBe(1)
  })
  it('entrevista concluída ou sincronizada nunca muda de versão', async () => {
    for (const status of ['completed', 'synced']) {
      const { db, adoptCurrentVersionIfEmpty } = await setup({ status }, false)
      expect(await adoptCurrentVersionIfEmpty('s')).toBe(1)
      expect(await versionOf(db)).toBe(1)
      freshIndexedDb()
    }
  })
  it('entrevista inexistente → null', async () => {
    const { adoptCurrentVersionIfEmpty } = await load()
    expect(await adoptCurrentVersionIfEmpty('nao-existe')).toBeNull()
  })
})

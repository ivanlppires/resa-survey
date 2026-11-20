import type { QuestionSeed } from './types.js'

/**
 * Questionário revisado (versão 2). Fonte: docs/Questionario_Socioeconomico_revisado.docx.
 * Textos, alternativas, ordem e numeração seguem o documento (que não tem os
 * números 13 e 37), com dois ajustes aprovados em 20/11/2026:
 *  - 26 dividida em 26 (uso de crédito) e 26b (finalidade, condicional);
 *  - 46 com faixas de área sem sobreposição nem lacuna.
 * As chaves levam o prefixo `v2_` para nunca colidir com as da versão 1.
 */

type Option = NonNullable<QuestionSeed['options']>[number]
type Section = QuestionSeed['section']
type Draft = Omit<QuestionSeed, 'version' | 'sortOrder'>

const o = (value: string, label: string): Option => ({ value, label })
/** Alternativa de negação/ausência: marcar desmarca as demais. */
const excl = (value: string, label: string): Option => ({ value, label, exclusive: true })
/** "Outro: ____" — o texto vai em textValue. */
const outro = (label = 'Outro', value = 'outro'): Option => ({ value, label, hasTextInput: true })

// Contexto da pergunta sendo declarada (o documento é linear: seção e subtítulo valem até mudar).
let section: Section = 'socioeconomic'
let subsection: string | null = null

const single = (key: string, number: number, text: string, options: Option[]): Draft =>
  ({ key: `v2_${key}`, number, text, type: 'single_choice', section, subsection, options })

const multi = (key: string, number: number, text: string, options: Option[], extra: Partial<Draft> = {}): Draft =>
  ({ key: `v2_${key}`, number, text, type: 'multiple_choice', section, subsection, options, ...extra })

/** Quadro: cada linha é uma pergunta própria, agrupada por groupKey. */
const grid = (
  groupKey: string, number: number, groupText: string, type: 'single_choice' | 'multiple_choice',
  options: Option[], rows: [key: string, label: string, rowOptions?: Option[]][],
): Draft[] => rows.map(([key, label, rowOptions]) => ({
  key: `v2_${key}`, number, text: label, type, section, subsection,
  options: rowOptions ?? options, groupKey: `v2_${groupKey}`, groupText,
}))

const RENDA = [
  o('ate_1600', 'Até R$ 1.600'),
  o('1601_4000', 'De R$ 1.601 a R$ 4.000'),
  o('4001_8000', 'De R$ 4.001 a R$ 8.000'),
  o('8001_12000', 'De R$ 8.001 a R$ 12.000'),
  o('12001_16000', 'De R$ 12.001 a R$ 16.000'),
  o('acima_16000', 'Acima de R$ 16.000'),
]

const drafts: Draft[] = []
const add = (...items: (Draft | Draft[])[]) => { drafts.push(...items.flat()) }

// ── Parte I – Perfil socioeconômico ─────────────────────

subsection = 'A. Família e trabalho'
add(
  single('q01_idade', 1, 'Idade do entrevistado', [
    o('18_29', '18 a 29 anos'), o('30_39', '30 a 39 anos'), o('40_49', '40 a 49 anos'),
    o('50_59', '50 a 59 anos'), o('60_mais', '60 anos ou mais'),
  ]),
  single('q02_escolaridade', 2, 'Escolaridade', [
    o('sem_escolarizacao', 'Sem escolarização'),
    o('fund_incompleto', 'Ensino fundamental incompleto'),
    o('fund_completo', 'Ensino fundamental completo'),
    o('medio_incompleto', 'Ensino médio incompleto'),
    o('medio_completo', 'Ensino médio completo (inclusive técnico)'),
    o('superior_incompleto', 'Ensino superior incompleto'),
    o('superior_completo', 'Ensino superior completo ou pós-graduação'),
  ]),
  single('q03_pessoas_residem', 3, 'Quantas pessoas residem na propriedade?', [
    o('1_2', '1 a 2'), o('3_4', '3 a 4'), o('5_6', '5 a 6'), o('7_8', '7 a 8'), o('mais_8', 'Mais de 8'),
  ]),
  single('q04_pessoas_trabalham', 4, 'Quantas dessas pessoas trabalham na propriedade?', [
    o('nenhuma', 'Nenhuma'), o('1_2', '1 a 2'), o('3_4', '3 a 4'), o('5_6', '5 a 6'), o('mais_6', 'Mais de 6'),
  ]),
  single('q05_anos_trabalho_rural', 5, 'Há quantos anos trabalha com a terra ou exerce trabalho rural?', [
    o('menos_5', 'Menos de 5 anos'), o('5_10', '5 a 10 anos'), o('11_20', '11 a 20 anos'),
    o('21_30', '21 a 30 anos'), o('mais_30', 'Mais de 30 anos'),
  ]),
  single('q06_mao_de_obra', 6, 'Como é a mão de obra na propriedade?', [
    o('familiar', 'Somente familiar'),
    o('familiar_eventual', 'Familiar, com contratação eventual (diaristas)'),
    o('familiar_permanente', 'Familiar, com contratação permanente'),
    o('parceria_meacao', 'Parceria ou meação'),
    o('contratada', 'Somente contratada'),
  ]),
)

subsection = 'B. Renda'
add(
  multi('q07_origem_renda', 7, 'De onde vem a renda da família?', [
    o('producao_propriedade', 'Produção da propriedade'),
    o('trabalho_formal_cidade', 'Trabalho formal na cidade'),
    o('trabalho_informal_cidade', 'Trabalho informal na cidade'),
    o('aposentadoria_pensao', 'Aposentadoria ou pensão'),
    o('beneficios_governo', 'Benefícios do governo (ex.: Bolsa Família)'),
    o('ajuda_familiares', 'Ajuda de familiares'),
    outro(),
  ]),
  single('q08_renda_propriedade', 8, 'Qual é a renda bruta mensal média gerada pelas atividades da propriedade?', [
    o('nao_gera', 'Não gera renda'), ...RENDA,
  ]),
  single('q09_renda_fora_propriedade', 9, 'Qual é a renda bruta mensal média da família obtida fora da propriedade (trabalho, aposentadoria, benefícios)?', [
    o('nao_possui', 'Não possui renda dessa origem'), ...RENDA,
  ]),
  single('q10_meses_sem_renda', 10, 'Há meses do ano em que a propriedade fica sem colheita ou sem renda da produção?', [
    o('nao', 'Não'), o('ate_2_meses', 'Sim, até 2 meses'), o('3_4_meses', 'Sim, de 3 a 4 meses'), o('mais_4_meses', 'Sim, mais de 4 meses'),
  ]),
  multi('q11_estrategia_sem_renda', 11, 'Nesses períodos, o que a família faz para se manter?', [
    excl('nao_se_aplica', 'Não se aplica (não há esses períodos)'),
    o('reserva_propria', 'Usa reserva financeira própria'),
    o('beneficios_governo', 'Conta com benefícios ou programas do governo'),
    o('credito', 'Busca crédito em banco, cooperativa ou associação'),
    o('apoio_prefeitura', 'Busca apoio da prefeitura'),
    o('ajuda_vizinhos_parentes', 'Pede ajuda a vizinhos ou parentes'),
    o('trabalho_fora', 'Faz trabalhos fora da propriedade'),
  ]),
)

subsection = 'C. Terra'
add(
  single('q12_area_total', 12, 'Qual é a área total da propriedade?', [
    o('ate_5', 'Até 5 ha'), o('6_10', 'De 6 a 10 ha'), o('11_20', 'De 11 a 20 ha'),
    o('21_30', 'De 21 a 30 ha'), o('31_40', 'De 31 a 40 ha'), o('acima_40', 'Acima de 40 ha'),
  ]),
  multi('q14_documentos_terra', 14, 'Quais documentos de uso da terra o entrevistado possui?', [
    o('ccu', 'Contrato de Concessão de Uso (CCU)'),
    o('cdru', 'Contrato de Concessão de Direito Real de Uso (CDRU)'),
    o('titulo_escritura', 'Título de domínio ou escritura'),
    o('car', 'Cadastro Ambiental Rural (CAR)'),
    excl('nenhum', 'Nenhum'),
  ]),
  single('q15_arrendamento', 15, 'Situação de arrendamento', [
    o('nao_arrenda', 'Não arrenda nem cede terra'),
    o('arrenda_de_outros', 'Arrenda terra de outros produtores'),
    o('arrenda_para_outros', 'Arrenda parte da sua terra para outros produtores'),
    o('ambos', 'Arrenda de outros e também cede parte da sua'),
  ]),
)

subsection = 'D. Produção e comercialização'
const DESTINO = [o('consumo', 'Consumo da família'), o('venda', 'Venda')]
add(
  grid('q16_produtos', 16, 'Marque os produtos da propriedade e o seu destino', 'multiple_choice', DESTINO, [
    ['q16_mandioca', 'Mandioca'],
    ['q16_hortalicas', 'Hortaliças (alface, couve, rúcula, repolho etc.)'],
    ['q16_legumes', 'Legumes (abóbora, pepino, tomate etc.)'],
    ['q16_feijao', 'Feijão'],
    ['q16_milho', 'Milho'],
    ['q16_frutas', 'Frutas'],
    ['q16_frango_ovos', 'Frango e ovos'],
    ['q16_porco', 'Porco'],
    ['q16_gado_corte', 'Gado de corte'],
    ['q16_leite_derivados', 'Leite e derivados'],
    ['q16_peixe', 'Peixe'],
    // O nome do produto vai em textValue quando a linha tem alguma marcação.
    ['q16_outro', 'Outro', DESTINO.map((d) => ({ ...d, hasTextInput: true }))],
  ]),
  single('q17_alimentacao_propria', 17, 'Quanto da alimentação da família vem da própria propriedade?', [
    o('quase_toda', 'Quase toda'), o('mais_metade', 'Mais da metade'), o('menos_metade', 'Menos da metade'), o('quase_nada', 'Quase nada'),
  ]),
  multi('q18_destino_venda', 18, 'Para onde a produção é vendida?', [
    excl('nao_comercializa', 'Não comercializa'),
    o('feira', 'Feira'),
    o('cooperativa_associacao', 'Cooperativa ou associação'),
    o('intermediarios', 'Intermediários (atravessadores)'),
    o('supermercados_comercio', 'Supermercados ou comércio local'),
    o('programas_institucionais', 'Programas institucionais (PAA, PNAE)'),
    outro(),
  ]),
  single('q19_perda_producao', 19, 'Há perda de produção por falta de comprador ou excesso de oferta?', [
    o('frequentemente', 'Frequentemente'), o('as_vezes', 'Às vezes'), o('nunca', 'Nunca'),
  ]),
  single('q20_evolucao_producao', 20, 'Como evoluiu a produção da propriedade nos últimos 5 anos?', [
    o('aumentou', 'Aumentou'), o('ficou_igual', 'Ficou igual'), o('diminuiu', 'Diminuiu'), o('nao_sabe', 'Não sabe'),
  ]),
  multi('q21_tecnologias', 21, 'Quais tecnologias a propriedade utiliza?', [
    o('maquinas', 'Máquinas agrícolas ou implementos'),
    o('aplicativos_gestao', 'Aplicativos ou sistemas de gestão'),
    o('sementes_melhoradas', 'Sementes ou mudas melhoradas'),
    excl('nenhuma', 'Nenhuma'),
    outro('Outra', 'outra'),
  ]),
)

subsection = 'E. Gestão, apoio e crédito'
add(
  single('q22_controle_financeiro', 22, 'Como é feito o controle financeiro da propriedade?', [
    o('nao_faz', 'Não faz controle'),
    o('de_cabeca', 'Faz de cabeça (na memória)'),
    o('caderno', 'Anota em caderno ou planilha de papel'),
    o('planilha_eletronica', 'Usa planilha eletrônica'),
    o('aplicativo', 'Usa aplicativo ou sistema de gestão'),
  ]),
  multi('q23_apoio_instituicoes', 23, 'A propriedade recebe apoio ou orientação de quais instituições?', [
    excl('nenhuma', 'Nenhuma'),
    o('empaer', 'Empaer (assistência técnica estadual)'),
    o('incra', 'INCRA'),
    o('prefeitura', 'Prefeitura'),
    o('sindicato', 'Sindicato'),
    o('sebrae', 'SEBRAE'),
    o('universidades', 'Universidades'),
    o('cooperativas_associacoes', 'Cooperativas ou associações'),
    outro('Outra', 'outra'),
  ]),
  single('q24_frequencia_assistencia', 24, 'Com que frequência recebe assistência técnica?', [
    o('regularmente', 'Regularmente'), o('as_vezes', 'Às vezes'), o('nunca', 'Nunca'),
  ]),
  multi('q25_programas_comercializacao', 25, 'A propriedade participa de algum programa governamental de comercialização?', [
    excl('nao_participa', 'Não participa'),
    o('paa', 'PAA (Programa de Aquisição de Alimentos)'),
    o('pnae', 'PNAE (alimentação escolar)'),
    outro(),
  ]),
  multi('q26_credito_rural', 26, 'Já utilizou crédito rural?', [
    excl('nunca_sem_interesse', 'Nunca utilizou e não tem interesse'),
    excl('nunca_gostaria', 'Nunca utilizou, mas gostaria'),
    o('sim_pronaf', 'Sim, PRONAF'),
    o('sim_outra_linha', 'Sim, outra linha de crédito'),
  ]),
  multi('q26b_finalidade_credito', 26, 'Para qual finalidade?', [
    o('custeio', 'Custeio'),
    o('investimento', 'Investimento ou infraestrutura'),
  ], { conditional: { dependsOn: 'v2_q26_credito_rural', showWhen: ['sim_pronaf', 'sim_outra_linha'] } }),
)

subsection = 'F. Condições de vida e perspectivas'
add(
  grid('q27_servicos', 27, 'Como avalia o acesso da família aos serviços abaixo?', 'single_choice',
    [o('bom', 'Bom'), o('regular', 'Regular'), o('ruim', 'Ruim'), o('nao_tem', 'Não tem')], [
      ['q27_saude', 'Serviço de saúde'],
      ['q27_escola', 'Escola para crianças e jovens'],
      ['q27_transporte_escolar', 'Transporte escolar'],
      ['q27_estradas', 'Estradas para escoar a produção'],
      ['q27_energia', 'Energia elétrica'],
      ['q27_internet', 'Internet'],
    ]),
  single('q28_continuar_rural', 28, 'Pretende continuar na atividade rural nos próximos anos?', [
    o('sim', 'Sim'), o('nao', 'Não'), o('nao_sabe', 'Não sabe'),
  ]),
  single('q29_jovens_interesse', 29, 'Os jovens da família têm interesse em continuar na atividade rural?', [
    o('sim_todos', 'Sim, todos'), o('alguns', 'Alguns'), o('nenhum', 'Nenhum'), o('nao_ha_jovens', 'Não há jovens na família'),
  ]),
  multi('q30_dificuldades', 30, 'Quais são as maiores dificuldades para viver e produzir na propriedade?', [
    o('falta_credito', 'Falta de crédito'),
    o('precos_mercado', 'Preços baixos ou falta de mercado'),
    o('custos_altos', 'Custos de produção altos'),
    o('clima', 'Clima (seca, excesso de chuva)'),
    o('falta_mao_de_obra', 'Falta de mão de obra'),
    o('falta_assistencia', 'Falta de assistência técnica'),
    o('solo', 'Manejo e fertilidade do solo'),
    o('estradas_ruins', 'Estradas ruins'),
    o('acesso_saude_escola', 'Dificuldade de acesso à saúde ou à escola'),
    o('falta_perspectiva', 'Falta de perspectiva para a família no local'),
    outro(),
  ], { maxSelections: 3 }),
)

// ── Parte II – Perfil comportamental ────────────────────

section = 'behavioral'
subsection = null
add(
  single('q31_busca_informacoes', 31, 'Antes de tomar decisões importantes sobre a propriedade, costuma buscar informações?', [
    o('sempre', 'Sempre'), o('as_vezes', 'Às vezes'), o('raramente', 'Raramente'), o('nunca', 'Nunca'),
  ]),
  single('q32_fonte_informacoes', 32, 'De onde vêm as informações que mais influenciam suas decisões?', [
    o('experiencia_propria', 'Experiência própria'),
    o('familia', 'Família'),
    o('outros_produtores', 'Outros produtores'),
    o('tecnicos', 'Técnicos ou assistência técnica'),
    o('midia', 'Internet, rádio ou TV'),
  ]),
  single('q33_criterio_cultivo', 33, 'Como decide o que cultivar?', [
    o('mercado', 'Pelo mercado (preço e procura)'),
    o('experiencia', 'Pela experiência que já tem com a cultura'),
    o('resultados_anteriores', 'Pelos resultados dos últimos anos'),
    o('previsao_clima', 'Pela previsão do clima'),
    o('rotacao', 'Pela rotação de culturas'),
    outro(),
  ]),
  single('q34_conversa_produtores', 34, 'Os produtores da comunidade conversam para decidir o que cada um vai produzir?', [
    o('sim_volume', 'Sim, para juntar volume de venda'),
    o('sim_variar', 'Sim, para variar a oferta'),
    o('trocam_decide_sozinho', 'Trocam informações, mas cada um decide sozinho'),
    o('nao_trocam', 'Não trocam informações'),
  ]),
  single('q35_relacao_vizinhos', 35, 'Como descreveria a relação entre os vizinhos na comunidade?', [
    o('muito_proxima', 'Muito próxima, com ajuda mútua'),
    o('cordial', 'Cordial, com ajuda só em emergências'),
    o('pouca_interacao', 'Pouca interação'),
    o('isolada', 'Comunidade isolada, quase sem contato'),
    o('conflitos', 'Há conflitos'),
  ]),
  single('q36_problema_comunidade', 36, 'Quando surge um problema que afeta a comunidade (água, estradas, energia), qual é a atitude mais comum?', [
    o('cada_familia', 'Cada família resolve sozinha'),
    o('liderancas', 'Lideranças se reúnem e decidem pelos demais'),
    o('coletiva', 'A comunidade se reúne e busca solução coletiva'),
    o('poder_publico', 'Espera-se que o poder público (prefeitura, INCRA) resolva'),
  ]),
  grid('q38_afirmacoes', 38, 'Indique o quanto cada afirmação descreve você', 'single_choice',
    [o('sim', 'Sim'), o('em_parte', 'Em parte'), o('nao', 'Não')], [
      ['q38a_ganho_garantido', 'Prefiro ganhar menos, mas com garantia'],
      ['q38b_medo_prejuizo', 'Já deixei de investir, mudar ou diversificar a produção por medo de prejuízo'],
      ['q38c_planeja_mais_um_ano', 'Planejo as atividades para mais de um ano'],
      ['q38d_reserva_financeira', 'Faço reserva financeira para anos ruins'],
      ['q38e_reduz_plantio', 'Depois de um ano ruim (ou com muito risco de clima), reduzo o plantio'],
      ['q38f_segue_orientacao', 'Seguiria uma orientação técnica mesmo para algo que nunca fiz'],
      ['q38g_evita_emprestimo', 'Evito empréstimo mesmo quando ele poderia melhorar a produção'],
      ['q38h_risco_uma_cultura', 'Acho arriscado depender de uma só cultura'],
      ['q38i_compara_precos', 'Comparo preços antes de vender a produção'],
      ['q38j_insiste_prejuizo', 'Quando uma cultura dá prejuízo, insisto nela antes de abandonar'],
    ]),
  multi('q39_novos_produtos', 39, 'Teria disposição para produzir novos produtos? Se sim, o que seria necessário?', [
    excl('nao_tem_interesse', 'Não tem interesse'),
    o('sementes_insumos', 'Sementes, mudas ou insumos'),
    o('mao_de_obra', 'Mão de obra'),
    o('equipamentos', 'Equipamentos'),
    o('assistencia_tecnica', 'Assistência técnica'),
    o('garantia_mercado', 'Garantia de mercado ou comprador'),
    outro(),
  ]),
)

// ── Parte III – Perfil ambiental ────────────────────────

section = 'environmental'
add(
  multi('q40_fontes_agua', 40, 'Quais são as fontes de água da propriedade?', [
    o('poco_artesiano', 'Poço artesiano ou semiartesiano'),
    o('poco_comum', 'Poço comum (cacimba)'),
    o('nascente', 'Nascente ou mina'),
    o('rio_corrego', 'Rio, córrego ou represa'),
    o('cisterna', 'Cisterna'),
    o('sistema_comunitario', 'Sistema comunitário'),
  ]),
  multi('q41_irrigacao', 41, 'A propriedade utiliza irrigação? Qual tipo?', [
    excl('nao_utiliza', 'Não utiliza'),
    o('gotejamento', 'Gotejamento'),
    o('aspersao', 'Aspersão'),
    o('sulco', 'Sulco'),
    o('manual', 'Manual (mangueira, regador)'),
  ]),
  single('q42_disponibilidade_agua', 42, 'A água disponível na propriedade é:', [
    o('suficiente', 'Suficiente o ano todo'),
    o('falta_alguns_meses', 'Falta em alguns meses'),
    o('insuficiente', 'Insuficiente na maior parte do ano'),
  ]),
  single('q43_agrotoxicos', 43, 'Uso de agrotóxicos e destino das embalagens', [
    o('nao_utiliza', 'Não utiliza agrotóxicos'),
    o('sempre_descarta', 'Utiliza e sempre devolve ou descarta corretamente as embalagens'),
    o('as_vezes_descarta', 'Utiliza e às vezes descarta corretamente'),
    o('nao_descarta', 'Utiliza e não descarta corretamente'),
  ]),
  multi('q44_praticas_solo', 44, 'Quais práticas de cuidado com o solo e o ambiente adota?', [
    excl('nenhuma', 'Nenhuma'),
    o('adubacao_organica', 'Adubação orgânica (esterco, compostagem)'),
    o('rotacao_culturas', 'Rotação de culturas'),
    o('cobertura_solo', 'Cobertura do solo ou plantio direto'),
    o('curvas_nivel', 'Curvas de nível ou terraços'),
    o('plantio_arvores', 'Plantio de árvores ou recuperação de áreas degradadas'),
    outro('Outra', 'outra'),
  ]),
  single('q45_sistema_producao', 45, 'Qual sistema de produção predomina na propriedade?', [
    o('convencional', 'Convencional'),
    o('organico', 'Orgânico ou agroecológico'),
    o('agroflorestal', 'Agroflorestal (SAF)'),
    o('misto', 'Misto'),
  ]),
  single('q46_area_preservacao', 46, 'Existe área de preservação na propriedade (mata ciliar, reserva legal, nascente protegida)?', [
    o('nao', 'Não'),
    o('ate_2', 'Sim, até 2 ha'),
    o('2_5', 'Sim, mais de 2 até 5 ha'),
    o('5_10', 'Sim, mais de 5 até 10 ha'),
    o('mais_10', 'Sim, mais de 10 ha'),
    o('nao_sabe', 'Não sabe informar'),
  ]),
  multi('q47_recursos_floresta', 47, 'A família utiliza recursos da floresta?', [
    excl('nao_utiliza', 'Não utiliza'),
    o('lenha_madeira', 'Lenha ou madeira'),
    o('frutos_castanhas', 'Frutos e castanhas'),
    o('plantas_medicinais', 'Plantas medicinais'),
    o('caca_pesca', 'Caça ou pesca'),
    outro(),
  ]),
  multi('q48_problemas_ambientais', 48, 'Quais problemas ambientais já observou na propriedade?', [
    excl('nao_observa', 'Não observa problemas'),
    o('erosao', 'Erosão'),
    o('queimadas', 'Queimadas'),
    o('desmatamento', 'Desmatamento'),
    o('assoreamento', 'Assoreamento de rios ou córregos'),
    outro(),
  ]),
  multi('q49_eventos_climaticos', 49, 'Nos últimos 5 anos, a produção foi afetada por eventos climáticos extremos?', [
    excl('nao', 'Não'),
    o('seca', 'Seca prolongada'),
    o('chuva_excessiva', 'Chuva excessiva ou enchente'),
    o('calor_extremo', 'Calor extremo'),
    o('ventania_granizo', 'Ventania ou granizo'),
    outro(),
  ]),
  {
    key: 'v2_q50_percepcao_clima',
    number: 50,
    text: 'Em uma escala de 1 a 5, o quanto percebe que o clima mudou nos últimos 10 anos? (1 = nenhuma mudança; 5 = muitas mudanças)',
    type: 'scale',
    section,
    subsection,
    scaleMin: 1,
    scaleMax: 5,
  },
)

export const questionsV2: QuestionSeed[] = drafts.map((q, i) => ({ ...q, version: 2, sortOrder: i + 1 }))

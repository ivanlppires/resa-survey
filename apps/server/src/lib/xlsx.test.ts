import { describe, it, expect } from 'vitest'
import { buildXlsx } from './xlsx.js'

// As entradas do ZIP são "stored" (sem compressão), então o XML das partes
// aparece verbatim (UTF-8) no buffer — dá para inspecioná-lo diretamente.
function asText(buf: Buffer): string {
  return buf.toString('utf8')
}

describe('buildXlsx', () => {
  it('gera um arquivo ZIP válido (assinatura PK) com as partes OOXML', () => {
    const buf = buildXlsx(['id'], [['1']])
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04])) // "PK\x03\x04"
    const text = asText(buf)
    expect(text).toContain('[Content_Types].xml')
    expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('<sheet name="Entrevistas"')
  })

  it('escreve números como células numéricas e texto como inlineStr', () => {
    const text = asText(buildXlsx(['id', 'nome'], [['42', 'João']]))
    expect(text).toContain('<c r="A2"><v>42</v></c>')
    expect(text).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">João</t></is></c>')
  })

  it('preserva zero à esquerda como texto (não vira número)', () => {
    const text = asText(buildXlsx(['lote'], [['007']]))
    expect(text).toContain('<is><t xml:space="preserve">007</t></is>')
    expect(text).not.toContain('<v>007</v>')
  })

  it('trata negativos e decimais como números', () => {
    const text = asText(buildXlsx(['lat'], [['-11.85']]))
    expect(text).toContain('<c r="A2"><v>-11.85</v></c>')
  })

  it('escapa caracteres reservados de XML', () => {
    const text = asText(buildXlsx(['x'], [['a & b < c > d']]))
    expect(text).toContain('a &amp; b &lt; c &gt; d')
  })

  it('gera referências de coluna corretas além de Z (AA, AB...)', () => {
    const header = Array.from({ length: 28 }, (_, i) => `c${i}`)
    const text = asText(buildXlsx(header, []))
    expect(text).toContain('r="Z1"')
    expect(text).toContain('r="AA1"')
    expect(text).toContain('r="AB1"')
  })

  it('inclui o cabeçalho como primeira linha', () => {
    const text = asText(buildXlsx(['id', 'assentamento'], [['1', 'Alto Alegre']]))
    expect(text).toContain('<row r="1">')
    expect(text).toContain('<t xml:space="preserve">assentamento</t>')
    expect(text).toContain('<row r="2">')
  })
})

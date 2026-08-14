/**
 * Gerador mínimo de PDF sem dependências, no espírito do xlsx.ts: código
 * pequeno e controlado em vez de uma biblioteca pesada. Usa as fontes padrão
 * Helvetica (Standard 14, presentes em todo leitor de PDF) com
 * WinAnsiEncoding, que cobre todos os acentos do português. Os content
 * streams são comprimidos com FlateDecode via node:zlib (stdlib).
 */
import { deflateSync } from 'node:zlib'

export type PdfFont = 'regular' | 'bold' | 'oblique'

export const A4 = { width: 595.28, height: 841.89 }

// Larguras (milésimos do corpo) dos caracteres ASCII 32–126, do AFM oficial
// da Adobe. Oblique compartilha as métricas da regular.
const WIDTHS_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const WIDTHS_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

// Caracteres fora do ASCII que aparecem nos textos e não derivam de uma base
// ASCII via decomposição (travessão, aspas curvas, ordinais etc.).
const EXTRA_WIDTHS: Record<string, number> = {
  '—': 1000, '–': 556, '…': 1000, '•': 350, '·': 278,
  '‘': 222, '’': 222, '“': 333, '”': 333,
  '°': 400, 'º': 365, 'ª': 370, '×': 584,
}

function charWidth(ch: string, table: number[]): number {
  const code = ch.codePointAt(0) ?? 0
  if (code >= 32 && code <= 126) return table[code - 32]
  const extra = EXTRA_WIDTHS[ch]
  if (extra != null) return extra
  // Acentuados de Latin-1 têm a mesma largura da letra-base em Helvetica.
  const base = ch.normalize('NFD')[0]
  const baseCode = base.codePointAt(0) ?? 0
  if (baseCode >= 32 && baseCode <= 126) return table[baseCode - 32]
  return 556
}

export function textWidth(text: string, size: number, font: PdfFont = 'regular'): number {
  const table = font === 'bold' ? WIDTHS_BOLD : WIDTHS_REGULAR
  let w = 0
  for (const ch of text) w += charWidth(ch, table)
  return (w / 1000) * size
}

/** Quebra o texto em linhas de no máximo maxWidth pontos, respeitando \n. */
export function wrapText(text: string, maxWidth: number, size: number, font: PdfFont = 'regular'): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) { lines.push(''); continue }
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (textWidth(candidate, size, font) <= maxWidth) {
        current = candidate
        continue
      }
      if (current) lines.push(current)
      // Palavra maior que a linha inteira: quebra por caractere.
      if (textWidth(word, size, font) > maxWidth) {
        let chunk = ''
        for (const ch of word) {
          if (textWidth(chunk + ch, size, font) > maxWidth && chunk) {
            lines.push(chunk)
            chunk = ''
          }
          chunk += ch
        }
        current = chunk
      } else {
        current = word
      }
    }
    if (current) lines.push(current)
  }
  return lines
}

// Pontos de código fora de Latin-1 que o WinAnsi (CP1252) representa em 0x80–0x9F.
const CP1252: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
}

/**
 * Codifica para WinAnsi (um byte por caractere, como string latin1) e escapa
 * os delimitadores de string literal do PDF. Caracteres irrepresentáveis
 * viram '?'.
 */
export function encodePdfText(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f
    let byte: number
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) byte = code
    else byte = CP1252[ch] ?? 0x3f
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += '\\'
    out += String.fromCharCode(byte)
  }
  return out
}

export type Rgb = [number, number, number]

export interface TextOpts {
  font?: PdfFont
  size?: number
  color?: Rgb
}

const FONT_RES: Record<PdfFont, string> = { regular: 'F1', bold: 'F2', oblique: 'F3' }
const BASE_FONTS: Record<PdfFont, string> = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  oblique: 'Helvetica-Oblique',
}

const n = (v: number) => (Math.round(v * 100) / 100).toString()

/**
 * Documento A4 de múltiplas páginas. Coordenadas nativas do PDF: origem no
 * canto inferior esquerdo, y crescendo para cima.
 */
export class PdfDoc {
  private pages: string[][] = []

  get pageCount(): number {
    return this.pages.length
  }

  /** Cria uma página e retorna seu índice. */
  addPage(): number {
    this.pages.push([])
    return this.pages.length - 1
  }

  private ops(pageIndex?: number): string[] {
    const idx = pageIndex ?? this.pages.length - 1
    const page = this.pages[idx]
    if (!page) throw new Error(`Página inexistente: ${idx}`)
    return page
  }

  text(x: number, y: number, str: string, opts: TextOpts = {}, pageIndex?: number): void {
    const font = FONT_RES[opts.font ?? 'regular']
    const size = opts.size ?? 10
    const [r, g, b] = opts.color ?? [0, 0, 0]
    this.ops(pageIndex).push(
      `BT ${n(r)} ${n(g)} ${n(b)} rg /${font} ${n(size)} Tf 1 0 0 1 ${n(x)} ${n(y)} Tm (${encodePdfText(str)}) Tj ET`,
    )
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color: Rgb = [0, 0, 0], pageIndex?: number): void {
    const [r, g, b] = color
    this.ops(pageIndex).push(`${n(r)} ${n(g)} ${n(b)} RG ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`)
  }

  rect(x: number, y: number, w: number, h: number, color: Rgb, pageIndex?: number): void {
    const [r, g, b] = color
    this.ops(pageIndex).push(`${n(r)} ${n(g)} ${n(b)} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`)
  }

  toBuffer(): Buffer {
    if (this.pages.length === 0) this.addPage()
    const objects: Buffer[] = []
    const pageObjNums = this.pages.map((_, i) => 6 + i * 2)

    objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'))
    const kids = pageObjNums.map((num) => `${num} 0 R`).join(' ')
    const fontRes = (Object.keys(FONT_RES) as PdfFont[])
      .map((f, i) => `/${FONT_RES[f]} ${3 + i} 0 R`).join(' ')
    objects.push(Buffer.from(
      `<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} ` +
      `/MediaBox [0 0 ${n(A4.width)} ${n(A4.height)}] /Resources << /Font << ${fontRes} >> >> >>`,
    ))
    for (const font of Object.keys(BASE_FONTS) as PdfFont[]) {
      objects.push(Buffer.from(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONTS[font]} /Encoding /WinAnsiEncoding >>`,
      ))
    }
    for (let i = 0; i < this.pages.length; i++) {
      objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /Contents ${7 + i * 2} 0 R >>`))
      const stream = deflateSync(Buffer.from(this.pages[i].join('\n'), 'latin1'))
      objects.push(Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
        stream,
        Buffer.from('\nendstream'),
      ]))
    }

    const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]
    let offset = parts[0].length
    const offsets: number[] = []
    objects.forEach((body, i) => {
      offsets.push(offset)
      const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')])
      parts.push(obj)
      offset += obj.length
    })

    const xref = [
      'xref',
      `0 ${objects.length + 1}`,
      '0000000000 65535 f ',
      ...offsets.map((o) => `${o.toString().padStart(10, '0')} 00000 n `),
      'trailer',
      `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
      'startxref',
      String(offset),
      '%%EOF',
      '',
    ].join('\n')
    parts.push(Buffer.from(xref))
    return Buffer.concat(parts)
  }
}

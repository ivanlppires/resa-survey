/**
 * Gerador mínimo de arquivos .xlsx (Office Open XML) sem dependências.
 * Um .xlsx é um ZIP contendo partes XML. Escrevemos o ZIP à mão (entradas
 * "stored", sem compressão) e as partes OOXML mínimas para uma planilha de
 * uma aba. Células numéricas viram números; o resto vira inline string.
 * Alinha-se ao estilo do projeto (ver csv.ts): código pequeno e controlado
 * em vez de uma biblioteca pesada.
 */

// ── ZIP (método "stored", sem compressão) ──────────────────────────────

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  name: string
  data: Buffer
}

function zip(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8')
    const crc = crc32(e.data)
    const size = e.data.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // local file header signature
    local.writeUInt16LE(20, 4)         // version needed
    local.writeUInt16LE(0, 6)          // flags
    local.writeUInt16LE(0, 8)          // method: 0 = stored
    local.writeUInt16LE(0, 10)         // mod time
    local.writeUInt16LE(0x21, 12)      // mod date = 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(size, 18)      // compressed size
    local.writeUInt32LE(size, 22)      // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)         // extra length
    parts.push(local, nameBuf, e.data)

    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)    // central directory header signature
    cd.writeUInt16LE(20, 4)            // version made by
    cd.writeUInt16LE(20, 6)            // version needed
    cd.writeUInt16LE(0, 8)             // flags
    cd.writeUInt16LE(0, 10)            // method
    cd.writeUInt16LE(0, 12)            // mod time
    cd.writeUInt16LE(0x21, 14)         // mod date
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(size, 20)
    cd.writeUInt32LE(size, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)            // extra length
    cd.writeUInt16LE(0, 32)            // comment length
    cd.writeUInt16LE(0, 34)            // disk number start
    cd.writeUInt16LE(0, 36)            // internal attrs
    cd.writeUInt32LE(0, 38)            // external attrs
    cd.writeUInt32LE(offset, 42)       // relative offset of local header
    central.push(cd, nameBuf)

    offset += local.length + nameBuf.length + e.data.length
  }

  const centralBuf = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)    // end of central directory signature
  eocd.writeUInt16LE(0, 4)             // disk number
  eocd.writeUInt16LE(0, 6)             // central dir start disk
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuf.length, 12)
  eocd.writeUInt32LE(offset, 16)       // offset of central directory
  eocd.writeUInt16LE(0, 20)            // comment length

  return Buffer.concat([...parts, centralBuf, eocd])
}

// ── OOXML ──────────────────────────────────────────────────────────────

/** Remove caracteres inválidos em XML 1.0 e escapa os reservados. */
function xmlEscape(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Números "limpos" (sem zero à esquerda, para não corromper lotes tipo "007").
const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/

function cell(col: number, row: number, value: string): string {
  const ref = `${colLetter(col)}${row}`
  if (value !== '' && NUMERIC.test(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Entrevistas" sheetId="1" r:id="rId1"/></sheets></workbook>`

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`

export function buildXlsx(header: string[], matrix: string[][]): Buffer {
  const allRows = [header, ...matrix]
  const rowsXml = allRows
    .map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => cell(c + 1, r + 1, v ?? '')).join('')}</row>`)
    .join('')

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`

  return zip([
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(WORKBOOK, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet, 'utf8') },
  ])
}

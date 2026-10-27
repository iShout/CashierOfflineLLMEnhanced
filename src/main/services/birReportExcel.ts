import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

type ZipEntry = {
  name: string
  method: number
  flags: number
  compressedSize: number
  uncompressedSize: number
  crc: number
  compressedData: Buffer
}

type FillWorkbookParams = {
  templatePath: string
  outputPath: string
  password: string
  scalar: Record<string, unknown>
  sheets: Record<string, Array<Record<string, unknown>>>
}

const UTF8_FLAG = 0x0800

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset)
}

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset)
}

function inflateEntry(entry: ZipEntry): Buffer {
  if (entry.method === 0) return entry.compressedData
  if (entry.method === 8) return zlib.inflateRawSync(entry.compressedData)
  throw new Error(`Unsupported XLSX zip compression method: ${entry.method}`)
}

function parseZip(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = []
  let offset = 0

  // xlsx 本质是 zip；这里只解析本项目模板需要的本地文件头，避免引入额外运行时依赖。
  while (offset < buffer.length && readUInt32(buffer, offset) === 0x04034b50) {
    const flags = readUInt16(buffer, offset + 6)
    const method = readUInt16(buffer, offset + 8)
    const crc = readUInt32(buffer, offset + 14)
    const compressedSize = readUInt32(buffer, offset + 18)
    const uncompressedSize = readUInt32(buffer, offset + 22)
    const nameLength = readUInt16(buffer, offset + 26)
    const extraLength = readUInt16(buffer, offset + 28)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize)

    entries.push({
      name,
      method,
      flags,
      compressedSize,
      uncompressedSize,
      crc,
      compressedData,
    })

    offset = dataStart + compressedSize
  }

  return entries
}

function writeZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const data = entry.data
    const crc = crc32(data)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(UTF8_FLAG, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(0, 10)
    localHeader.writeUInt16LE(0, 12)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(data.length, 18)
    localHeader.writeUInt32LE(data.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, nameBuffer, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(UTF8_FLAG, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(0, 12)
    centralHeader.writeUInt16LE(0, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(data.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + data.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0)
  endRecord.writeUInt16LE(0, 4)
  endRecord.writeUInt16LE(0, 6)
  endRecord.writeUInt16LE(entries.length, 8)
  endRecord.writeUInt16LE(entries.length, 10)
  endRecord.writeUInt32LE(centralDirectory.length, 12)
  endRecord.writeUInt32LE(offset, 16)
  endRecord.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralDirectory, endRecord])
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function offsetCellRef(cellRef: string, targetRow: number): string {
  return `${cellRef.replace(/[0-9]/g, '')}${targetRow}`
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  const siMatches = xml.match(/<si[\s\S]*?<\/si>/g) ?? []
  for (const si of siMatches) {
    const textParts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1]))
    strings.push(textParts.join(''))
  }
  return strings
}

function inlineStringCell(cellXml: string, value: unknown): string {
  const withoutType = cellXml
    .replace(/\s+t="[^"]*"/, '')
    .replace(/<v>[\s\S]*?<\/v>/, '')
    .replace(/<is>[\s\S]*?<\/is>/, '')
  return withoutType.replace(/<c\b/, '<c t="inlineStr"').replace(/\/>$/, `><is><t>${escapeXml(value)}</t></is></c>`)
    .replace(/>(?![\s\S]*<is>)(?:[\s\S]*?)<\/c>$/, `><is><t>${escapeXml(value)}</t></is></c>`)
}

function replaceScalarPlaceholders(sheetXml: string, sharedStrings: string[], scalar: Record<string, unknown>): string {
  // 头部字段是 EasyExcel 的普通占位符，直接替换成 inlineStr 保留原单元格样式。
  return sheetXml.replace(/<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g, (cellXml, indexText) => {
    const template = sharedStrings[Number(indexText)]
    if (!template || !template.includes('{') || template.includes('{.')) {
      return cellXml
    }

    const value = template.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => String(scalar[key] ?? ''))
    return inlineStringCell(cellXml, value)
  })
}

function fillCollectionRows(sheetXml: string, sharedStrings: string[], rows: Array<Record<string, unknown>>): string {
  if (!rows.length) {
    rows = [{}]
  }

  // 明细行模拟 EasyExcel forceNewRow：复制模板占位符行并逐行写入数据。
  return sheetXml.replace(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g, (rowXml, rowNumberText) => {
    if (!rowXml.includes('<v>')) return rowXml
    const hasCollectionPlaceholder = [...rowXml.matchAll(/<c\b[^>]*\bt="s"[^>]*>[\s\S]*?<v>(\d+)<\/v>[\s\S]*?<\/c>/g)].some(
      (match) => (sharedStrings[Number(match[1])] ?? '').includes('{.'),
    )
    if (!hasCollectionPlaceholder) return rowXml

    const sourceRowNumber = Number(rowNumberText)
    return rows
      .map((dataRow, index) => {
        const targetRowNumber = sourceRowNumber + index
        return rowXml
          .replace(/\br="\d+"/, `r="${targetRowNumber}"`)
          .replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, (cellXml) => {
            const refMatch = cellXml.match(/\br="([A-Z]+\d+)"/)
            const sharedIndexMatch = cellXml.match(/<v>(\d+)<\/v>/)
            const nextRef = refMatch ? offsetCellRef(refMatch[1], targetRowNumber) : ''
            const withRef = refMatch ? cellXml.replace(/\br="[A-Z]+\d+"/, `r="${nextRef}"`) : cellXml
            if (!sharedIndexMatch) return withRef

            const template = sharedStrings[Number(sharedIndexMatch[1])] ?? ''
            const fieldMatch = template.match(/^\{\.([^}]+)\}$/)
            if (!fieldMatch) return withRef

            return inlineStringCell(withRef, dataRow[fieldMatch[1]] ?? '')
          })
      })
      .join('')
  })
}

function protectSheet(sheetXml: string, password: string): string {
  // 后端写完后会逐个 sheet 加保护，本地导出也补同样的保护标记。
  if (sheetXml.includes('<sheetProtection ')) return sheetXml
  const protection = `<sheetProtection password="${escapeXml(password)}" sheet="1" objects="1" scenarios="1"/>`
  const sheetDataEnd = sheetXml.indexOf('</sheetData>')
  if (sheetDataEnd >= 0) {
    return `${sheetXml.slice(0, sheetDataEnd + '</sheetData>'.length)}${protection}${sheetXml.slice(sheetDataEnd + '</sheetData>'.length)}`
  }
  return sheetXml.replace('</worksheet>', `${protection}</worksheet>`)
}

function fillSheetXml(
  xml: string,
  sharedStrings: string[],
  scalar: Record<string, unknown>,
  rows: Array<Record<string, unknown>>,
  password: string,
): string {
  let nextXml = replaceScalarPlaceholders(xml, sharedStrings, scalar)
  nextXml = fillCollectionRows(nextXml, sharedStrings, rows)
  return protectSheet(nextXml, password)
}

export function fillBirReportWorkbook(params: FillWorkbookParams): void {
  const source = fs.readFileSync(params.templatePath)
  const parsed = parseZip(source)
  const inflated = new Map(parsed.map((entry) => [entry.name, inflateEntry(entry)]))
  const sharedStringsXml = inflated.get('xl/sharedStrings.xml')?.toString('utf8') ?? ''
  const sharedStrings = parseSharedStrings(sharedStringsXml)
  const sheetRowsByIndex: Record<number, Array<Record<string, unknown>>> = {
    1: params.sheets['E-1'] ?? [],
    2: params.sheets['E-2'] ?? [],
    3: params.sheets['E-3'] ?? [],
  }

  const outputEntries = parsed.map((entry) => {
    let data = inflated.get(entry.name) ?? Buffer.alloc(0)
    const sheetMatch = entry.name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)
    if (sheetMatch) {
      const sheetIndex = Number(sheetMatch[1])
      const xml = data.toString('utf8')
      data = Buffer.from(fillSheetXml(xml, sharedStrings, params.scalar, sheetRowsByIndex[sheetIndex] ?? [], params.password), 'utf8')
    }
    return { name: entry.name, data }
  })

  fs.mkdirSync(path.dirname(params.outputPath), { recursive: true })
  fs.writeFileSync(params.outputPath, writeZip(outputEntries))
}

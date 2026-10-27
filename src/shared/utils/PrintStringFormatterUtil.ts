/**
 * 打印字符串格式化工具类
 * 用于处理打印时的字符串格式化、换行、对齐等功能
 * 注意：中文字符在计算长度时占 2 个字符宽度
 */

/**
 * 上下文接口（类似于 Velocity Context）
 */
export interface PrintContext {
  put(key: string, value: string): void
  get(key: string): string | undefined
}

/**
 * 格式化字符串并用 \n 拼接的结果
 * @param totalLength 每行的总显示长度
 * @param prefix 开头信息
 * @param suffix 结尾信息
 * @returns 用 \n 拼接的字符串
 * @example
 * formatWithNewline(20, '商品名称', '10.00')  // 自动换行并对齐
 */
export const formatWithNewline = (
  totalLength: number,
  prefix: string,
  suffix: string
): string => {
  // 参数校验
  if (totalLength <= 0) {
    throw new Error('The total length must be greater than 0')
  }

  prefix = prefix ?? ''
  suffix = suffix ?? ''

  // 计算后缀长度
  const suffixLen = calculateDisplayLength(suffix)

  // 处理前缀换行
  const prefixLines = wrapPrefix(prefix, totalLength, suffixLen)

  // 处理最后一行（带后缀）
  const splicedSpaces = ' '.repeat(totalLength - suffixLen) + suffix

  if (prefixLines.length > 0 && suffix !== '') {
    const lastLine = prefixLines[prefixLines.length - 1]
    const lastLineLen = calculateDisplayLength(lastLine)
    const remainingSpace = totalLength - lastLineLen - suffixLen

    if (remainingSpace >= 0) {
      // 可以放下后缀
      prefixLines[prefixLines.length - 1] = lastLine + ' '.repeat(remainingSpace) + suffix
    } else {
      // 放不下后缀，添加到新行
      prefixLines.push(splicedSpaces)
    }
  } else if (suffix !== '') {
    // 只有后缀的情况
    prefixLines.push(splicedSpaces)
  }

  // 最后加一个换行
  return prefixLines.join('\n') + '\n'
}

/**
 * 处理前缀换行（考虑最后一行要放后缀）
 */
const wrapPrefix = (
  prefix: string,
  maxLength: number,
  suffixLen: number
): string[] => {
  const lines: string[] = []

  if (!prefix) {
    return lines
  }

  let currentLine = ''
  let currentLength = 0

  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i]
    const charLength = isChineseChar(c) ? 2 : 1

    // 检查是否需要换行（考虑最后一行要放后缀）
    let needNewline = false
    if (lines.length === 0) {
      // 第一行要预留后缀空间
      needNewline = currentLength + charLength > maxLength - suffixLen
    } else {
      // 其他行按正常长度
      needNewline = currentLength + charLength > maxLength
    }

    if (needNewline && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = ''
      currentLength = 0
    }

    currentLine += c
    currentLength += charLength
  }

  // 添加最后一行
  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  // 为除最后一行外的所有行填充空格
  for (let i = 0; i < lines.length - 1; i++) {
    lines[i] = lines[i] + ' '.repeat(suffixLen)
  }

  return lines
}

/**
 * 判断是否为中文字符
 * @param c 字符
 * @returns 是否为中文字符
 */
const isChineseChar = (c: string): boolean => {
  const code = c.charCodeAt(0)
  return (
    (code >= 0x4e00 && code <= 0x9fa5) || // 基本汉字
    (code >= 0x3000 && code <= 0x303f) || // 中文标点符号
    (code >= 0xff00 && code <= 0xffef) // 全角符号
  )
}

/**
 * 计算字符串的显示长度（中文算2个字符）
 * @param str 字符串
 * @returns 显示长度
 */
/**
 * 字符串居中对齐
 * @param text 文本
 * @param width 总宽度
 * @returns 居中对齐后的字符串
 */
export const centerAlign = (text: string, width: number): string => {
  const displayLength = calculateDisplayLength(text);
  if (displayLength >= width) {
    return text;
  }
  const padding = Math.floor((width - displayLength) / 2);
  return ' '.repeat(padding) + text + ' '.repeat(width - displayLength - padding);
};

export const calculateDisplayLength = (str: string): number => {
  if (!str) {
    return 0
  }

  let length = 0
  for (let i = 0; i < str.length; i++) {
    length += isChineseChar(str[i]) ? 2 : 1
  }
  return length
}

/**
 * 格式化字符串（左对齐，右侧填充空格）
 * @param title 标题（只用于计算长度）
 * @param value 值
 * @param len 总长度
 * @returns 格式化后的字符串
 * @example
 * formatString('商品', '苹果', 10)  // '苹果      '
 */
export const formatString = (
  title: string,
  value: string,
  len: number
): string => {
  if (title.length + value.length + 1 > len) {
    const x = len - title.length - 1
    const one = value.substring(0, x + 1)
    const two = value.substring(x + 1)
    let res = ' ' + one + '\n'
    res = res + two
    return res
  } else {
    const length = len - title.length
    return value.padStart(length + value.length, ' ')
  }
}

/**
 * 按照指定长度换行，单词整个换行
 * 支持原字符串中已有的换行符
 * @param text 原始文本
 * @param maxLength 最大长度
 * @returns 换行后的文本
 */
export const wrapText = (text: string, maxLength: number): string => {
  if (!text || text.trim() === '') {
    return text
  }

  const lines = text.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const wrappedLine = wrapSingleLine(lines[i], maxLength)
    result.push(wrappedLine)
  }

  return result.join('\n')
}

/**
 * 处理单行文本的换行
 * @param line 单行文本
 * @param maxLength 最大长度
 * @returns 换行后的文本
 */
const wrapSingleLine = (line: string, maxLength: number): string => {
  // 判断当前行是否只有一个单词（不包含空格）
  if (!line.includes(' ')) {
    return wrapWord(line, maxLength)
  }
  return wrapMultipleWords(line, maxLength)
}

/**
 * 处理包含多个单词的行
 * @param line 包含多个单词的行
 * @param maxLength 最大长度
 * @returns 换行后的文本
 */
const wrapMultipleWords = (line: string, maxLength: number): string => {
  const words = line.split(' ')
  const wrappedText: string[] = []
  let currentLine = ''

  for (const word of words) {
    const result = processWord(word, maxLength, currentLine)
    if (result.newLine) {
      wrappedText.push(currentLine)
      currentLine = result.newLineContent
    } else {
      currentLine = result.newLineContent
    }
  }

  // 追加最后一行
  if (currentLine.length > 0) {
    wrappedText.push(currentLine)
  }

  return wrappedText.join('\n')
}

/**
 * 处理单词的结果接口
 */
interface ProcessWordResult {
  newLine: boolean
  newLineContent: string
}

/**
 * 处理单个单词
 * @param word 单词
 * @param maxLength 最大长度
 * @param currentLine 当前行
 * @returns 处理结果
 */
const processWord = (
  word: string,
  maxLength: number,
  currentLine: string
): ProcessWordResult => {
  if (word.length > maxLength) {
    // 单词超长，需要拆分
    return handleLongWord(word, maxLength, currentLine)
  } else if (shouldStartNewLine(word, currentLine, maxLength)) {
    // 需要换行
    return {
      newLine: true,
      newLineContent: word
    }
  } else {
    // 追加到当前行
    return {
      newLine: false,
      newLineContent: appendWordToCurrentLine(word, currentLine)
    }
  }
}

/**
 * 处理超长单词
 * @param word 超长单词
 * @param maxLength 最大长度
 * @param currentLine 当前行
 * @returns 处理结果
 */
const handleLongWord = (
  word: string,
  maxLength: number,
  currentLine: string
): ProcessWordResult => {
  // 先将当前行追加到结果
  if (currentLine.length > 0) {
    // 这里需要返回一个特殊标记，表示当前行需要先保存
    return {
      newLine: true,
      newLineContent: word + '\n' + word.substring(0, maxLength) // 暂时这样处理，实际调用者需要特殊处理
    }
  }

  // 拆分超长单词（这个会在 wrapMultipleWords 外部处理）
  return {
    newLine: false,
    newLineContent: currentLine
  }
}

/**
 * 判断是否需要开始新行（支持中文字符宽度计算）
 * @param word 待添加的单词
 * @param currentLine 当前行
 * @param maxLength 最大长度（中文字符算2个宽度）
 * @returns 是否需要换行
 */
const shouldStartNewLine = (
  word: string,
  currentLine: string,
  maxLength: number
): boolean => {
  const spaceNeeded = currentLine.length > 0 ? 1 : 0
  return calculateDisplayLength(currentLine) + calculateDisplayLength(word) + spaceNeeded > maxLength
}

/**
 * 将单词追加到当前行
 * @param word 单词
 * @param currentLine 当前行
 * @returns 追加后的行
 */
const appendWordToCurrentLine = (
  word: string,
  currentLine: string
): string => {
  if (currentLine.length > 0) {
    return currentLine + ' ' + word
  }
  return word
}

/**
 * 换行单个单词（支持中文字符宽度计算）
 * @param text 文本
 * @param maxLength 最大长度（中文字符算2个宽度）
 * @returns 换行后的文本
 */
export const wrapWord = (text: string, maxLength: number): string => {
  if (calculateDisplayLength(text) <= maxLength) {
    return text
  }

  const result: string[] = []
  let currentLine = ''
  let currentLength = 0

  for (const c of text) {
    const charLen = isChineseChar(c) ? 2 : 1
    if (currentLength + charLen > maxLength && currentLine.length > 0) {
      result.push(currentLine)
      result.push('\n')
      currentLine = ''
      currentLength = 0
    }
    currentLine += c
    currentLength += charLen
  }

  if (currentLine.length > 0) {
    result.push(currentLine)
  }

  return result.join('')
}

/**
 * 左边留白（右对齐）
 * @param text 文本
 * @param length 总长度
 * @returns 填充后的字符串
 * @example
 * concatenateEmptyStringsLeft('Hello', 10)  // 'Hello     '
 */
export const concatenateEmptyStringsLeft = (
  text: string,
  length: number
): string => {
  const spacesNeeded = Math.max(0, length - text.length)
  return text + ' '.repeat(spacesNeeded)
}

/**
 * 右边留白（左对齐）
 * @param text 文本
 * @param length 总长度
 * @returns 填充后的字符串
 * @example
 * concatenateEmptyStringsRight('Hello', 10)  // '     Hello'
 */
export const concatenateEmptyStringsRight = (
  text: string,
  length: number
): string => {
  const spacesNeeded = Math.max(0, length - text.length)
  return ' '.repeat(spacesNeeded) + text
}

/**
 * 打印加粗处理
 * @param text 文本
 * @param isBold 是否加粗
 * @returns 处理后的字符串
 * @example
 * processBolding('重要文本', true)  // '<b>重要文本'
 */
export const processBolding = (text: string, isBold: boolean): string => {
  if (isBold) {
    return '<b>' + text
  }
  return text
}

/**
 * 上下文工具方法集合
 */
export class ContextHelper {
  /**
   * 将值放入上下文（如果值不为空）
   */
  static putBestContext(key: string, value: string, context: PrintContext): void {
    if (value && value.trim() !== '') {
      context.put(key, value)
    }
  }

  /**
   * 将换行后的文本放入上下文
   */
  static putWrapTextContext(
    key: string,
    value: string,
    total: number,
    context: PrintContext
  ): void {
    if (value && value.trim() !== '') {
      context.put(key, wrapText(value, total))
    }
  }

  /**
   * 将格式化的字符串放入上下文
   */
  static putFormatStringContext(
    key: string,
    value: string,
    total: number,
    context: PrintContext
  ): void {
    if (value && value.trim() !== '') {
      context.put(key, formatString(key, value, total))
    }
  }

  /**
   * 将格式化的字符串放入上下文（带标题）
   */
  static putFormatStringContextWithTitle(
    key: string,
    value: string,
    title: string,
    total: number,
    context: PrintContext
  ): void {
    if (!title) {
      title = key
    }
    if (value && value.trim() !== '') {
      context.put(key, formatString(title, value, total))
    }
  }
}

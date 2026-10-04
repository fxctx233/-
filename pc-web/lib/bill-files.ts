import { unzipSync, strFromU8 } from 'fflate';
import {
  BlobReader,
  ERR_ENCRYPTED,
  ERR_INVALID_PASSWORD,
  ERR_UNSUPPORTED_ENCRYPTION,
  ZipReader,
  configure,
} from '@zip.js/zip.js';
import {
  decodeCSV,
  parseCSV,
  rowsToBills,
  type BillRow,
} from './bill-import.ts';
import type { Book } from './ledger.ts';

const MAX_FILE = 10 * 1024 * 1024;
const MAX_ARCHIVE_CONTENT = 20 * 1024 * 1024;
// The bundled Android page has no network access and does not start blob workers.
configure({ useWebWorkers: false });
function xml(text: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error('不支持含外部实体的 Excel。');
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    throw new Error('Excel XML 数据损坏。');
  return doc;
}
const elements = (parent: Document | Element, name: string) =>
  Array.from(parent.getElementsByTagNameNS('*', name));
const textValue = (parent: Element) =>
  elements(parent, 't')
    .map((t) => t.textContent ?? '')
    .join('');

// Small, read-only XLSX adapter for exported bills. No formulas/macros/external links run.
export function readXlsx(bytes: Uint8Array): string[][] {
  let size = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      const wanted =
        /^xl\/(sharedStrings\.xml|workbook\.xml|worksheets\/sheet\d+\.xml)$/.test(
          file.name,
        );
      if (!wanted) return false;
      size += file.originalSize;
      if (size > 24 * 1024 * 1024 || !Number.isFinite(file.originalSize))
        throw new Error('Excel 解压后过大，请缩短账单日期范围。');
      return true;
    },
  });
  if (!files['xl/workbook.xml'])
    throw new Error('不是有效的 XLSX 文件，请先解压邮件中的 ZIP。');
  const workbook = xml(strFromU8(files['xl/workbook.xml']));
  if (
    elements(workbook, 'workbookPr').some((p) =>
      ['1', 'true'].includes(p.getAttribute('date1904') ?? ''),
    )
  )
    throw new Error('不支持 1904 日期系统，请使用平台原始导出文件。');
  const strings = files['xl/sharedStrings.xml']
    ? elements(xml(strFromU8(files['xl/sharedStrings.xml'])), 'si').map(
        textValue,
      )
    : [];
  const candidates: string[][][] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.startsWith('xl/worksheets/')) continue;
    const sheet = xml(strFromU8(bytes));
    const rawRows = elements(sheet, 'row');
    if (rawRows.length > 50080) throw new Error('Excel 行数过多，请分批导入。');
    const rows = rawRows.map((row) => {
      const result: string[] = [];
      for (const c of elements(row, 'c')) {
        const ref = c.getAttribute('r') ?? '';
        const letters = ref.match(/^[A-Z]+/)?.[0];
        if (!letters) throw new Error('Excel 单元格位置无效。');
        const col =
          letters
            .split('')
            .reduce((v, char) => v * 26 + char.charCodeAt(0) - 64, 0) - 1;
        if (col > 63) throw new Error('账单列数超出支持范围。');
        const type = c.getAttribute('t');
        const value = elements(c, 'v')[0]?.textContent ?? '';
        while (result.length <= col) result.push('');
        if (elements(c, 'f').length)
          throw new Error('账单包含公式，请使用未修改的原始导出文件。');
        if (type === 's') {
          if (!/^\d+$/.test(value) || Number(value) >= strings.length)
            throw new Error('Excel 文本索引无效。');
          result[col] = strings[Number(value)];
        } else result[col] = type === 'inlineStr' ? textValue(c) : value;
      }
      return result;
    });
    if (rows.some((row) => row.some((v) => v.trim() === '交易时间')))
      candidates.push(rows);
  }
  if (candidates.length !== 1)
    throw new Error('请提供只有一个交易明细工作表的原始账单。');
  return candidates[0];
}
function parseBillBytes(bytes: Uint8Array, name: string, book: Book) {
  const extension = name.toLowerCase().split('.').pop();
  let table: string[][];
  if (extension === 'csv') table = parseCSV(decodeCSV(bytes));
  else if (extension === 'xlsx') table = readXlsx(bytes);
  else throw new Error('支持 CSV、XLSX 和 ZIP；PDF 和 XLS 暂不支持。');
  return rowsToBills(table, name, book);
}

async function readZipBills(file: File, book: Book, password: string) {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    if (entries.length > 100) throw new Error('ZIP 内文件过多，请检查账单压缩包。');
    const bills = entries.filter(
      (entry) => !entry.directory && /\.(csv|xlsx)$/i.test(entry.filename),
    );
    if (!bills.length)
      throw new Error('ZIP 中没有找到支付宝 CSV 或微信 XLSX／CSV 账单。');
    if (bills.length > 8)
      throw new Error('ZIP 内账单超过 8 份，请分批导入。');
    if (bills.some((entry) => entry.encrypted) && !password)
      throw new Error('该压缩包需要解压密码，请输入后重试。');
    let total = 0;
    for (const entry of bills) {
      if (!Number.isFinite(entry.uncompressedSize) || entry.uncompressedSize > MAX_FILE)
        throw new Error('ZIP 内单份账单超过 10 MB，请缩短导出日期范围。');
      total += entry.uncompressedSize;
    }
    if (total > MAX_ARCHIVE_CONTENT)
      throw new Error('ZIP 内账单总量超过 20 MB，请分批导入。');
    const result: BillRow[] = [];
    let decoded = 0;
    for (const entry of bills) {
      if (entry.directory) continue;
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        await entry.getData(
          new WritableStream<Uint8Array>({
            write(chunk) {
              size += chunk.byteLength;
              decoded += chunk.byteLength;
              if (size > MAX_FILE || decoded > MAX_ARCHIVE_CONTENT)
                throw new Error('ZIP 解压后过大，请缩短账单日期范围。');
              chunks.push(chunk);
            },
          }),
          { password },
        );
      } catch (error) {
        const message = (error as Error).message;
        if (message === ERR_INVALID_PASSWORD || message === ERR_ENCRYPTED)
          throw new Error('解压密码不正确或尚未输入，请核对后重试。');
        if (message === ERR_UNSUPPORTED_ENCRYPTION)
          throw new Error('该 ZIP 使用了暂不支持的加密格式。');
        throw error;
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      result.push(...(await parseBillBytes(bytes, entry.filename, book)));
    }
    return result;
  } finally {
    await reader.close();
  }
}

export async function readBillFile(file: File, book: Book, password = ''): Promise<BillRow[]> {
  if (!file.size || file.size > MAX_FILE)
    throw new Error('请选择非空且不超过 10 MB 的文件。');
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'zip') return readZipBills(file, book, password);
  return parseBillBytes(new Uint8Array(await file.arrayBuffer()), file.name, book);
}

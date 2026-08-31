import { unzipSync, strFromU8 } from 'fflate';
import {
  decodeCSV,
  parseCSV,
  rowsToBills,
  type BillRow,
} from './bill-import.ts';
import type { Book } from './ledger.ts';

const MAX_FILE = 10 * 1024 * 1024;
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
export async function readBillFile(file: File, book: Book): Promise<BillRow[]> {
  if (!file.size || file.size > MAX_FILE)
    throw new Error('请选择非空且不超过 10 MB 的文件。');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.toLowerCase().split('.').pop();
  let table: string[][];
  if (extension === 'csv') table = parseCSV(decodeCSV(bytes));
  else if (extension === 'xlsx') table = readXlsx(bytes);
  else throw new Error('支持 CSV 和 XLSX；ZIP 请先解压，PDF 和 XLS 暂不支持。');
  return rowsToBills(table, file.name, book);
}

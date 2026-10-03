import {
  buildImportedBook,
  markDuplicates,
  recommendCategory,
  type BillRow,
  type Source,
} from './bill-import.ts';
import { validDate, type Book, type Kind } from './ledger.ts';

export type SyncGroup = { texts: string[]; capturedAt: number };
export type NativeSyncState = {
  status: 'idle' | 'running' | 'complete' | 'error';
  source?: Source;
  since?: string;
  message?: string;
  groups?: SyncGroup[];
};

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function detectedDate(text: string, capturedAt: number) {
  const full = text.match(/(20\d{2})[年./-](\d{1,2})[月./-](\d{1,2})日?/);
  if (full) {
    const value = `${full[1]}-${pad(Number(full[2]))}-${pad(Number(full[3]))}`;
    return validDate(value) ? value : '';
  }
  const base = new Date(capturedAt || Date.now());
  if (text.includes('昨天')) {
    base.setDate(base.getDate() - 1);
    return localDate(base);
  }
  if (text.includes('今天')) return localDate(base);
  const short = text.match(/(?:^|\s)(\d{1,2})月(\d{1,2})日/);
  if (short) {
    const value = `${base.getFullYear()}-${pad(Number(short[1]))}-${pad(Number(short[2]))}`;
    return validDate(value) ? value : '';
  }
  return localDate(base);
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, '0');
}

export function syncGroupsToRows(
  state: NativeSyncState,
  book: Book,
): BillRow[] {
  const source = state.source;
  if (!source || !Array.isArray(state.groups)) return [];
  const rows: BillRow[] = [];
  const seen = new Set<string>();
  state.groups.forEach((group, index) => {
    const texts = Array.isArray(group.texts)
      ? group.texts
          .map(String)
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
    const raw = texts.join(' · ').slice(0, 1000);
    const amountMatch = raw.match(
      /(?:^|\s)([+\-]?)[\s]*[¥￥][\s]*(\d{1,8}(?:\.\d{1,2})?)|(?:^|\s)([+\-])\s*(\d{1,8}\.\d{2})(?=\s|$)/,
    );
    if (!amountMatch) return;
    const amount = amountMatch[2] ?? amountMatch[4];
    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return;
    const sign = amountMatch[1] ?? amountMatch[3] ?? '';
    const kind: Kind =
      sign === '+' || /退款|收入|收款|已收钱|转入/.test(raw)
        ? 'income'
        : 'expense';
    const date = detectedDate(raw, Number(group.capturedAt));
    if (!validDate(date) || (state.since && date <= state.since)) return;
    const timeMatch = raw.match(
      /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/,
    );
    const time = timeMatch
      ? `${pad(Number(timeMatch[1]))}:${timeMatch[2]}`
      : '';
    const timestamp =
      timeMatch?.[3] !== undefined ? `${date} ${time}:${timeMatch[3]}` : '';
    const merchant =
      texts.find(
        (v) =>
          v.length >= 2 &&
          v.length <= 100 &&
          !/[¥￥]\s*\d|^[+\-]\s*\d/.test(v) &&
          !/^\d{1,2}:\d{2}/.test(v) &&
          !/^(今天|昨天|账单|全部|支出|收入|退款|交易成功|支付成功)$/.test(v),
      ) ?? '未识别商家';
    const key = `readonly-${hash(source + '|' + raw)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const recommended =
      kind === 'income' && /退款/.test(raw)
        ? { category: '退款', reason: '只读同步识别到退款收入' }
        : recommendCategory(source, merchant, '', raw, kind, book);
    rows.push({
      id: `${key}-${index}`,
      source,
      file: '只读同步助手',
      line: index + 1,
      key,
      date,
      time,
      timestamp,
      merchant,
      description: raw,
      originalCategory: '',
      direction: kind === 'income' ? '收入' : '支出',
      status: '只读识别',
      cents: Math.round(amountNumber * 100),
      amount,
      kind,
      category: recommended.category,
      activity: '',
      include: true,
      remember: false,
      reason: recommended.reason,
      classificationReason: recommended.reason,
      special: false,
      invalid: false,
      duplicate: false,
      possibleDuplicate: false,
    });
  });
  return markDuplicates(rows, book);
}

export function importSyncRows(book: Book, rows: BillRow[], source: Source) {
  return buildImportedBook(
    book,
    rows.filter(
      (row) => row.include && !row.duplicate && !row.possibleDuplicate,
    ),
    `readonly-${source}-${Date.now()}`,
  );
}

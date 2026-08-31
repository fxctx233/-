import {
  cents,
  validDate,
  validateBook,
  type Book,
  type Kind,
} from './ledger.ts';

export type Source = 'wechat' | 'alipay';
export type BillRow = {
  id: string;
  source: Source;
  file: string;
  line: number;
  key: string;
  date: string;
  time: string;
  timestamp: string;
  merchant: string;
  description: string;
  originalCategory: string;
  direction: string;
  status: string;
  cents: number;
  amount: string;
  kind: Kind;
  category: string;
  activity: string;
  include: boolean;
  remember: boolean;
  reason: string;
  classificationReason: string;
  special: boolean;
  invalid: boolean;
  duplicate: boolean;
  possibleDuplicate: boolean;
};
export const sourceName = (s: Source) => (s === 'wechat' ? '微信' : '支付宝');
const clean = (v: unknown) =>
  (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
    .replace(/^\uFEFF/, '')
    .trim();

// RFC 4180 quoting, embedded newlines, escaped quotes and CRLF; never evaluate cells.
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || !value.trim()) quoted = !quoted;
      else value += c;
    } else if (c === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      if (rows.length > 50080)
        throw new Error('单个文件最多支持 50,000 笔账目。');
    } else value += c;
  }
  if (quoted) throw new Error('CSV 引号不完整，请重新导出原始账单。');
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
export function decodeCSV(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030', { fatal: true }).decode(bytes);
  }
}
export function billMoment(value: string) {
  let s = clean(value);
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel's 1900 date system, rounded to a second, independent of host timezone.
    const date = new Date(
      Date.UTC(1899, 11, 30) + Math.round(Number(s) * 86400) * 1000,
    );
    s = date.toISOString().replace('T', ' ').slice(0, 19);
  }
  const m = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!m) throw new Error('日期无法识别');
  const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const time = m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : '';
  if (
    !validDate(date) ||
    (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
    Number(m[6] ?? 0) > 59
  )
    throw new Error('日期或时间无效');
  return {
    date,
    time,
    full: m[4] && m[6] !== undefined ? date + ' ' + time + ':' + m[6] : '',
  };
}
export function recommendCategory(
  source: Source,
  merchant: string,
  original: string,
  description: string,
  kind: Kind,
  book: Book,
) {
  const text = merchant + ' ' + description + ' ' + original;
  // User-defined defaults take priority over generic platform categories or older rules.
  if (kind === 'expense' && /沃尔玛|wal\s*-?\s*mart|超市/i.test(text))
    return {
      category: '综合购物',
      reason: '沃尔玛或超市消费，自动归为综合购物',
    };
  if (kind === 'expense' && /工作需求|工作用品|办公用品|办公耗材/.test(text))
    return {
      category: '工作需求',
      reason: '明确标注工作或办公用品，自动归为工作需求',
    };
  if (
    kind === 'expense' &&
    /肯德基|KFC|美团|蔬果|蔬菜|水果|饮料|蜜雪冰城|餐饮|餐厅|面馆|饭店|快餐|麦当劳|瑞幸|奶茶|咖啡|小吃|汉堡|食堂|生鲜|果蔬|食品|外卖|早餐|午餐|晚餐/i.test(
      text,
    )
  )
    return { category: '餐饮', reason: '按你的餐饮关键词规则自动归类' };
  const rule = book.merchantRules?.find(
    (r) => r.source === source && r.merchant === merchant && r.kind === kind,
  );
  if (rule) return { category: rule.category, reason: '你保存的商家规则' };
  const aliases: Record<string, string> = {
    餐饮美食: '餐饮',
    交通出行: '交通',
    文化休闲: '娱乐',
    日用百货: '购物',
    服饰装扮: '购物',
    数码电器: '购物',
    美容美发: '购物',
    医疗健康: '医疗',
    住房物业: '住房',
    家居家装: '住房',
    酒店旅游: '住房',
    工资: '工资',
    工资收入: '工资',
  };
  const candidate =
    aliases[original] ??
    (book.categories[kind].includes(original) ? original : '');
  if (candidate && book.categories[kind].includes(candidate))
    return { category: candidate, reason: '根据账单原分类推荐' };
  const rules: [RegExp, string][] =
    kind === 'expense'
      ? [
          [
            /餐饮|餐厅|面馆|饭店|快餐|肯德基|麦当劳|瑞幸|蜜雪冰城|奶茶|咖啡|小吃|汉堡|食堂/,
            '餐饮',
          ],
          [
            /地铁|公交|铁路|12306|滴滴|顺风车|停车|高速通行|出租车|单车|电动车|充电桩|高德打车/,
            '交通',
          ],
          [/影院|电影院|游戏|Steam|Valve/i, '娱乐'],
          [/医院|药房|药店|诊所/, '医疗'],
          [/淘宝|拼多多|京东|超市|便利店|百货|服装/, '购物'],
          [/软件|订阅|网盘|充电宝|工具/, '工具'],
        ]
      : [
          [/工资|薪资|代发薪/, '工资'],
          [/公积金/, '公积金'],
        ];
  const hit = rules.find(
    ([pattern, category]) =>
      pattern.test(text) && book.categories[kind].includes(category),
  );
  return hit
    ? { category: hit[1], reason: '根据商家或商品关键词推荐' }
    : { category: '其他', reason: '未匹配专门规则，自动归入其他，可随时修改' };
}
async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
export function summarizeBills(rows: BillRow[]) {
  const groups = new Map<
    string,
    { kind: Kind; category: string; cents: number; count: number }
  >();
  let income = 0,
    expense = 0,
    refund = 0;
  for (const r of rows) {
    if (!r.include) continue;
    let amount: number;
    try {
      amount = cents(r.amount);
    } catch {
      continue;
    }
    if (amount <= 0) continue;
    if (r.kind === 'income') {
      income += amount;
      if (r.category === '退款') refund += amount;
    } else expense += amount;
    const key = r.kind + ':' + r.category;
    const g = groups.get(key) ?? {
      kind: r.kind,
      category: r.category || '其他',
      cents: 0,
      count: 0,
    };
    g.cents += amount;
    g.count++;
    groups.set(key, g);
  }
  return {
    income,
    expense,
    refund,
    balance: income - expense,
    groups: [...groups.values()].sort((a, b) => b.cents - a.cents),
  };
}
export function reclassifyImported(book: Book, rows: BillRow[]) {
  const recommendations = new Map<string, BillRow>();
  rows
    .filter((r) => !r.invalid && !r.special)
    .forEach((r) => {
      const key = r.source + ':' + r.key;
      if (!recommendations.has(key)) recommendations.set(key, r);
    });
  let changed = 0,
    matched = 0;
  const entries = book.entries.map((e) => {
    if (!e.importInfo) return e;
    const r = recommendations.get(e.importInfo.source + ':' + e.importInfo.key);
    if (!r) return e;
    matched++;
    if (r.kind !== e.kind || r.category !== e.category) changed++;
    return {
      ...e,
      kind: r.kind,
      category: r.category,
      importInfo: {
        ...e.importInfo,
        ...(r.timestamp ? { timestamp: r.timestamp } : {}),
      },
    };
  });
  return { book: validateBook({ ...book, entries }), changed, matched };
}
export async function rowsToBills(
  table: string[][],
  file: string,
  book: Book,
): Promise<BillRow[]> {
  const h = table.findIndex(
    (row) =>
      row.some((v) => clean(v) === '交易时间') &&
      row.some((v) => /^(金额|金额[（(]元[）)])$/.test(clean(v))),
  );
  if (h < 0)
    throw new Error(
      '未找到交易表头。请选择“用于个人对账”的原始 CSV 或 XLSX 文件。',
    );
  const header = table[h].map(clean);
  const source: Source = header.includes('交易单号') ? 'wechat' : 'alipay';
  const required = [
    '交易时间',
    '交易对方',
    '收/支',
    source === 'wechat' ? '交易单号' : '交易订单号',
  ];
  if (
    !required.every((name) => header.includes(name)) ||
    !header.some((name) => ['当前状态', '交易状态'].includes(name))
  )
    throw new Error('账单列不完整或不是支持的微信／支付宝个人账单。');
  const read = (row: string[], ...names: string[]) =>
    clean(row[header.findIndex((name) => names.includes(name))]);
  const output: BillRow[] = [];
  for (let i = h + 1; i < table.length; i++) {
    const raw = table[i];
    if (raw.every((v) => !clean(v))) continue;
    // Export footers are not transactions, but malformed transaction rows stay visible.
    if (raw.length < 5 && !/^\d{4}[-/]|^\d{5}/.test(clean(raw[0]))) continue;
    let invalid = false,
      reason = '',
      date = '',
      time = '',
      full = '',
      amount = 0;
    try {
      ({ date, time, full } = billMoment(read(raw, '交易时间')));
    } catch {
      invalid = true;
      reason = '日期无法识别，不能导入';
    }
    try {
      const value = read(raw, '金额', '金额(元)', '金额（元）').replace(
        /[¥￥,，\s]/g,
        '',
      );
      amount = cents(value);
      if (!amount) throw new Error();
    } catch {
      invalid = true;
      reason = '金额无效或为零，不能导入';
    }
    const merchant = read(raw, '交易对方').slice(0, 200);
    const description = read(raw, '商品', '商品说明').slice(0, 300);
    const originalCategory = read(raw, '交易分类', '交易类型');
    const status = read(raw, '当前状态', '交易状态');
    const direction = read(raw, '收/支');
    let kind: Kind = direction === '收入' ? 'income' : 'expense';
    const txn = read(raw, '交易单号', '交易订单号').replace(/^[`']/, '');
    const refund = /退款|退回|退还/.test(
      originalCategory + status + description + merchant,
    );
    const accountMove =
      /充值|提现|信用借还|账户存取|零钱通|余额宝|还款|转账到银行卡/.test(
        originalCategory + status,
      );
    const personalTransfer =
      !accountMove &&
      /转账|扫二维码付款|二维码收付款|个人收款|收款码/.test(
        originalCategory + status,
      );
    const unknownDirection = !['收入', '支出'].includes(direction);
    const closed = /关闭|失败|撤销|未支付|待支付/.test(status);
    const pending =
      !/等待确认收货|待收货/.test(status) &&
      /等待付款|处理中|进行中|待确认|待收款|待到账/.test(status);
    // WeChat marks BOTH the original debit and the separate refund credit as refunded.
    // Alipay refund receipts can be marked "不计收支". Never turn the original debit into a credit.
    const refundRow =
      refund &&
      (direction !== '支出' ||
        /^(退款|退回)$|[-－]退款$/.test(originalCategory));
    if (refundRow) kind = 'income';
    const special =
      closed || pending || (!refundRow && (accountMove || unknownDirection));
    let rec = recommendCategory(
      source,
      merchant,
      originalCategory,
      description,
      kind,
      book,
    );
    if (refundRow)
      rec = {
        category: '退款',
        reason: '退款到账自动记为退款收入，原消费支出保留',
      };
    else if (kind === 'expense' && personalTransfer && amount < 3000)
      rec = {
        category: '餐饮',
        reason: '按你的规则：低于 30 元的个人支出转账自动归为餐饮',
      };
    else if (kind === 'expense' && personalTransfer && rec.category === '其他')
      rec = {
        category: '转账',
        reason: '其他个人支出转账，自动归为转账',
      };
    if (!refundRow && refund && direction === '支出')
      rec.reason += '；这是原消费支出，另列退款收入，不重复转换';
    if (!invalid)
      reason = closed
        ? '关闭或失败的交易，默认不计入'
        : pending
          ? '尚未完成的交易，默认不计入'
          : special
            ? '账户划转／不计收支，自动排除，不列为可疑订单'
            : rec.reason;
    // Do not retain account numbers or original transaction IDs in the app.
    const key = await digest(
      JSON.stringify([
        source,
        txn || [full, merchant, description, amount, direction],
        refundRow ? 'refund' : 'payment',
      ]),
    );
    output.push({
      id: crypto.randomUUID(),
      source,
      file,
      line: i + 1,
      key,
      date,
      time,
      timestamp: full,
      merchant,
      description,
      originalCategory,
      direction,
      status,
      cents: amount,
      amount: (amount / 100).toFixed(2),
      kind,
      category: rec.category,
      activity: '',
      include: !invalid && !special,
      remember: false,
      reason,
      classificationReason: reason,
      special,
      invalid,
      duplicate: false,
      possibleDuplicate: false,
    });
    if (output.length > 50000)
      throw new Error('单个文件最多支持 50,000 笔账目。');
  }
  if (!output.length) throw new Error('文件中没有交易记录。');
  return output;
}
export function markDuplicates(rows: BillRow[], book: Book): BillRow[] {
  const seen = new Set(
    book.entries.flatMap((e) =>
      e.importInfo ? [e.importInfo.source + ':' + e.importInfo.key] : [],
    ),
  );
  const times = new Map<string, Set<string>>();
  const addTime = (time: string | undefined, key: string) => {
    if (!time) return; // Minute-only old records do not have exact original timestamps.
    const ids = times.get(time) ?? new Set<string>();
    ids.add(key);
    times.set(time, ids);
  };
  book.entries.forEach((e) =>
    addTime(
      e.importInfo?.timestamp,
      e.importInfo ? e.importInfo.source + ':' + e.importInfo.key : e.id,
    ),
  );
  rows
    .filter((r) => !r.invalid && !r.special)
    .forEach((r) => addTime(r.timestamp, r.source + ':' + r.key));
  return rows.map((r) => {
    const key = r.source + ':' + r.key;
    const duplicate = seen.has(key);
    seen.add(key);
    const possibleDuplicate =
      !duplicate &&
      !r.invalid &&
      !r.special &&
      !!r.timestamp &&
      (times.get(r.timestamp)?.size ?? 0) > 1;
    return {
      ...r,
      duplicate,
      possibleDuplicate,
      include: r.include && !duplicate && !possibleDuplicate,
      reason: duplicate
        ? '同一交易已在账本或本次文件中，自动跳过重复导入'
        : possibleDuplicate
          ? r.classificationReason + '；年月日时分秒完全相同，可能是重复订单'
          : r.classificationReason,
    };
  });
}
export function buildImportedBook(
  book: Book,
  rows: BillRow[],
  batch: string,
): Book {
  book = validateBook(book);
  const selected = rows.filter((r) => r.include);
  if (!selected.length) throw new Error('请至少选择一笔账目。');
  const seen = new Set(
    book.entries.flatMap((e) =>
      e.importInfo ? [e.importInfo.source + ':' + e.importInfo.key] : [],
    ),
  );
  const rules = [...(book.merchantRules ?? [])];
  const entries = selected.map((r) => {
    const key = r.source + ':' + r.key;
    if (r.invalid || r.duplicate || seen.has(key))
      throw new Error('包含无效或重复交易，请重新检查预览。');
    seen.add(key);
    if (!book.categories[r.kind].includes(r.category))
      throw new Error('选中的账目还有未确认的分类。');
    const amount = cents(r.amount);
    if (amount <= 0) throw new Error('导入金额必须大于零。');
    if (r.remember && r.merchant) {
      const rule = {
        source: r.source,
        merchant: r.merchant,
        kind: r.kind,
        category: r.category,
      };
      const index = rules.findIndex(
        (x) =>
          x.source === r.source &&
          x.merchant === r.merchant &&
          x.kind === r.kind,
      );
      if (index >= 0) rules[index] = rule;
      else rules.push(rule);
    }
    return {
      id: crypto.randomUUID(),
      date: r.date,
      ...(r.time ? { time: r.time } : {}),
      kind: r.kind,
      category: r.category,
      cents: amount,
      activity: r.activity.trim(),
      note: [sourceName(r.source), r.merchant, r.description]
        .filter(Boolean)
        .join(' · ')
        .slice(0, 300),
      importInfo: {
        source: r.source,
        key: r.key,
        batch,
        merchant: r.merchant,
        ...(r.timestamp ? { timestamp: r.timestamp } : {}),
      },
    };
  });
  return validateBook({
    ...book,
    entries: [...entries, ...book.entries],
    merchantRules: rules,
  });
}

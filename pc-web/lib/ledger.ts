export type Kind = 'expense' | 'income';
export type Entry = {
  id: string;
  date: string;
  time?: string;
  kind: Kind;
  category: string;
  cents: number;
  note: string;
  activity?: string;
  importInfo?: {
    source: 'wechat' | 'alipay';
    key: string;
    batch: string;
    merchant: string;
    timestamp?: string;
  };
};
export type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string;
  installments?: Installment[];
  completed?: boolean;
};
export type Installment = {
  id: string;
  date: string;
  cents: number;
  done: boolean;
};

export function makeInstallments(
  total: number,
  start: string,
  mode: 'monthly' | 'months',
  value: number,
): Installment[] {
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    total > 99999999999 ||
    !validDate(start) ||
    !Number.isSafeInteger(value) ||
    value <= 0
  )
    throw new Error('请填写有效的金额、期数和开始日期。');
  const count = mode === 'monthly' ? Math.ceil(total / value) : value;
  if (count > 120 || count > total)
    throw new Error('请将分期设为 1–120 期，且每期至少 0.01 元。');
  let left = total;
  return Array.from({ length: count }, (_, i) => {
    const monthIndex =
      Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1 + i;
    const y = Math.floor(monthIndex / 12),
      m = (monthIndex % 12) + 1;
    const day = Math.min(
      Number(start.slice(8, 10)),
      new Date(Date.UTC(y, m, 0)).getUTCDate(),
    );
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (!validDate(date)) throw new Error('分期日期超出支持范围。');
    const amount =
      mode === 'monthly'
        ? Math.min(left, value)
        : Math.floor(total / count) + (i < total % count ? 1 : 0);
    left -= amount;
    return { id: `period-${i + 1}`, date, cents: amount, done: false };
  });
}
export function installmentPaid(g: Goal) {
  return (g.installments ?? [])
    .filter((p) => p.done)
    .reduce((s, p) => s + p.cents, 0);
}
export function toggleInstallment(g: Goal, id: string, done: boolean): Goal {
  const p = g.installments?.find((p) => p.id === id);
  if (!p || p.done === done) return g;
  const saved = g.saved + (done ? p.cents : -p.cents);
  if (saved < 0 || saved > 99999999999)
    throw new Error('更新后的已存金额超出范围。');
  return {
    ...g,
    saved,
    completed: false,
    installments: g.installments!.map((p) =>
      p.id === id ? { ...p, done } : p,
    ),
  };
}
export function entryMoment(
  original: Entry | null,
  customDate: string | null,
  customTime: string,
  now = new Date(),
): { date: string; time?: string } {
  if (customDate !== null) {
    if (!validDate(customDate) || customDate > today(now))
      throw new Error('补记日期不能晚于今天。');
    if (customTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(customTime))
      throw new Error('请填写有效时间。');
    return { date: customDate, ...(customTime ? { time: customTime } : {}) };
  }
  return original
    ? { date: original.date, ...(original.time ? { time: original.time } : {}) }
    : { date: today(now), time: currentTime(now) };
}
export type ShoppingPlan = {
  id: string;
  name: string;
  items: { id: string; name: string; cents: number }[];
};
export type Book = {
  shoppingPlans?: ShoppingPlan[];
  version: 1;
  currentFunds?: number;
  entries: Entry[];
  goals: Goal[];
  categories: Record<Kind, string[]>;
  merchantRules?: {
    source: 'wechat' | 'alipay';
    merchant: string;
    kind: Kind;
    category: string;
  }[];
};
export const KEY = 'xiaoman-ledger-v1';
export function removeShoppingItem(
  book: Book,
  planId: string,
  itemId: string,
): Book {
  const plan = book.shoppingPlans?.find((p) => p.id === planId);
  if (!plan || !plan.items.some((i) => i.id === itemId))
    throw new Error('该物品已不存在，请重新查看清单。');
  return validateBook({
    ...book,
    shoppingPlans: book.shoppingPlans!.map((p) =>
      p.id === planId
        ? { ...p, items: p.items.filter((i) => i.id !== itemId) }
        : p,
    ),
  });
}
export function currentFunds(book: Book): number {
  return book.currentFunds ?? totals(book.entries).balance;
}
export function applyFundsChange(previous: Book, next: Book): Book {
  // Only apply the change in ledger net income. Existing entries are not charged again.
  const delta = totals(next.entries).balance - totals(previous.entries).balance;
  return validateBook({
    ...next,
    currentFunds: (next.currentFunds ?? currentFunds(previous)) + delta,
  });
}
export function adjustCurrentFunds(
  book: Book,
  action: 'set' | 'add' | 'subtract',
  amount: number,
): Book {
  if (
    !Number.isSafeInteger(amount) ||
    Math.abs(amount) > 99999999999 ||
    (action !== 'set' && amount <= 0)
  )
    throw new Error('请填写有效金额；增加或减少资金时金额须大于零。');
  const balance = currentFunds(book);
  const next =
    action === 'set'
      ? amount
      : action === 'add'
        ? balance + amount
        : balance - amount;
  if (!Number.isSafeInteger(next) || Math.abs(next) > 99999999999)
    throw new Error('调整后的资金总额超出支持范围。');
  return validateBook({ ...book, currentFunds: next });
}
export function bulkUpdateEntries(
  book: Book,
  ids: string[],
  action: { type: 'delete' } | { type: 'category'; category: string },
): Book {
  const selected = new Set(ids);
  const matches = book.entries.filter((e) => selected.has(e.id));
  if (!matches.length || matches.length !== selected.size)
    throw new Error('所选账目已变化，请重新勾选。');
  if (
    action.type === 'category' &&
    matches.some((e) => !book.categories[e.kind].includes(action.category))
  ) {
    throw new Error('此分类不适用于部分所选账目，请将收入和支出分别处理。');
  }
  return validateBook({
    ...book,
    entries:
      action.type === 'delete'
        ? book.entries.filter((e) => !selected.has(e.id))
        : book.entries.map((e) =>
            selected.has(e.id) ? { ...e, category: action.category } : e,
          ),
  });
}
const addedExpenseCategories = ['转账', '工作需求', '综合购物'];
export const emptyBook = (): Book => ({
  version: 1,
  entries: [],
  goals: [],
  categories: {
    expense: [
      '餐饮',
      '工具',
      '娱乐',
      '交通',
      '住房',
      '购物',
      '医疗',
      '其他',
      ...addedExpenseCategories,
    ],
    income: ['工资', '股票', '公积金', '奖金', '退款', '其他'],
  },
});
export function today(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function currentTime(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function money(n: number) {
  return (
    '¥ ' +
    (n / 100).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
export function cents(s: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
    throw new Error(
      '金额请填写数字，最多两位小数，且不超过 999,999,999.99 元。',
    );
  const [a, b = ''] = s.split('.');
  return Number(a) * 100 + Number(b.padEnd(2, '0'));
}
export function validDate(s: unknown): s is string {
  if (
    typeof s !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    s < '1900-01-01' ||
    s > '9999-12-31'
  )
    return false;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
}
export function periodEntries(book: Book, mode: string, date: string) {
  const len = mode === 'year' ? 4 : mode === 'month' ? 7 : 10;
  return book.entries.filter(
    (e) => e.date.slice(0, len) === date.slice(0, len),
  );
}
export function totals(entries: Entry[]) {
  const income = entries
    .filter((e) => e.kind === 'income')
    .reduce((s, e) => s + e.cents, 0);
  const expense = entries
    .filter((e) => e.kind === 'expense')
    .reduce((s, e) => s + e.cents, 0);
  return { income, expense, balance: income - expense };
}
export type EntrySort = 'date' | 'time' | 'amount';
export function sortEntries(
  entries: Entry[],
  field: EntrySort,
  direction: 'asc' | 'desc',
): Entry[] {
  const sign = direction === 'asc' ? 1 : -1;
  const clock = (e: Entry) => {
    if (!e.time) return '';
    const original = e.importInfo?.timestamp;
    return original &&
      original.slice(0, 10) === e.date &&
      original.slice(11, 16) === e.time
      ? original.slice(11)
      : e.time + ':00';
  };
  const compareTime = (a: Entry, b: Entry) => {
    const at = clock(a),
      bt = clock(b);
    // Unknown times always follow known times, in either direction.
    if (!at || !bt) return Number(!at) - Number(!bt);
    return at.localeCompare(bt) * sign;
  };
  return [...entries].sort((a, b) => {
    if (field === 'amount')
      return (a.cents - b.cents) * sign || b.date.localeCompare(a.date);
    if (field === 'time')
      return compareTime(a, b) || b.date.localeCompare(a.date);
    return a.date.localeCompare(b.date) * sign || compareTime(a, b);
  });
}
export type EntryRanges = {
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
  amountMin: string;
  amountMax: string;
};
export const emptyEntryRanges = (): EntryRanges => ({
  dateFrom: '',
  dateTo: '',
  timeFrom: '',
  timeTo: '',
  amountMin: '',
  amountMax: '',
});
export function filterEntryRanges(
  entries: Entry[],
  range: EntryRanges,
): Entry[] {
  for (const value of [range.dateFrom, range.dateTo]) {
    if (value && !validDate(value)) throw new Error('请填写有效的起止日期。');
  }
  if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo)
    throw new Error('开始日期不能晚于结束日期。');
  for (const value of [range.timeFrom, range.timeTo]) {
    if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw new Error('请填写有效的时间，精确到分钟。');
  }
  if (range.timeFrom && range.timeTo && range.timeFrom > range.timeTo)
    throw new Error('开始时间不能晚于结束时间；跨午夜请分两次筛选。');
  let min: number | undefined, max: number | undefined;
  try {
    if (range.amountMin.trim()) min = cents(range.amountMin.trim());
    if (range.amountMax.trim()) max = cents(range.amountMax.trim());
  } catch {
    throw new Error('金额范围请填写非负数字，最多两位小数。');
  }
  if (min !== undefined && max !== undefined && min > max)
    throw new Error('最低金额不能大于最高金额。');
  return entries.filter(
    (e) =>
      (!range.dateFrom || e.date >= range.dateFrom) &&
      (!range.dateTo || e.date <= range.dateTo) &&
      (!(range.timeFrom || range.timeTo) ||
        (!!e.time &&
          (!range.timeFrom || e.time >= range.timeFrom) &&
          (!range.timeTo || e.time <= range.timeTo))) &&
      (min === undefined || e.cents >= min) &&
      (max === undefined || e.cents <= max),
  );
}
export function remaining(g: Goal) {
  return Math.max(0, g.target - g.saved);
}
export function monthsLeft(g: Goal, now = today()) {
  if (g.deadline < now) return 0;
  return (
    (Number(g.deadline.slice(0, 4)) - Number(now.slice(0, 4))) * 12 +
    Number(g.deadline.slice(5, 7)) -
    Number(now.slice(5, 7)) +
    1
  );
}
export function validateBook(raw: unknown): Book {
  if (!raw || typeof raw !== 'object') throw new Error('不是有效备份。');
  const x = raw as Book;
  if (
    x.version !== 1 ||
    !Array.isArray(x.entries) ||
    !Array.isArray(x.goals) ||
    !x.categories
  )
    throw new Error('备份格式或版本不兼容。');
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const amount = (v: unknown) =>
    Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 99999999999;
  if (
    x.currentFunds !== undefined &&
    (!Number.isSafeInteger(x.currentFunds) ||
      Math.abs(x.currentFunds) > 99999999999)
  )
    throw new Error('当前资金总额无效。');
  for (const k of ['income', 'expense'] as Kind[]) {
    const c = x.categories[k];
    if (
      !Array.isArray(c) ||
      !c.length ||
      c.length >
        200 +
          (k === 'income'
            ? Number(c.includes('退款'))
            : addedExpenseCategories.filter((name) => c.includes(name))
                .length) ||
      c.some((n) => !text(n, 30)) ||
      new Set(c).size !== c.length
    )
      throw new Error('分类数据无效。');
  }
  if (x.entries.length > 50000 || x.goals.length > 1000)
    throw new Error('备份记录数量超出上限（账目 50,000 笔，计划 1,000 个）。');
  const ids = new Set<string>();
  if (x.shoppingPlans !== undefined) {
    if (!Array.isArray(x.shoppingPlans) || x.shoppingPlans.length > 200)
      throw new Error('购物计划数量无效。');
    for (const plan of x.shoppingPlans) {
      if (
        !plan ||
        !text(plan.id, 100) ||
        ids.has(plan.id) ||
        !text(plan.name, 60) ||
        !Array.isArray(plan.items) ||
        plan.items.length > 1000
      )
        throw new Error('购物计划数据无效。');
      ids.add(plan.id);
      for (const item of plan.items) {
        if (
          !item ||
          !text(item.id, 100) ||
          ids.has(item.id) ||
          !text(item.name, 100) ||
          !amount(item.cents)
        )
          throw new Error('购物物品数据无效。');
        ids.add(item.id);
      }
    }
  }
  for (const e of x.entries) {
    if (
      !e ||
      !text(e.id, 100) ||
      ids.has(e.id) ||
      !validDate(e.date) ||
      (e.time !== undefined &&
        (typeof e.time !== 'string' ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))) ||
      !['income', 'expense'].includes(e.kind) ||
      !x.categories[e.kind]?.includes(e.category) ||
      !amount(e.cents) ||
      e.cents === 0 ||
      typeof e.note !== 'string' ||
      e.note.length > 300
    )
      throw new Error('账目数据无效或包含重复记录。');
    ids.add(e.id);
    if (
      e.activity !== undefined &&
      (typeof e.activity !== 'string' || e.activity.length > 60)
    )
      throw new Error('活动标签无效。');
    if (e.importInfo !== undefined) {
      const m = e.importInfo;
      if (
        !m ||
        !['wechat', 'alipay'].includes(m.source) ||
        typeof m.key !== 'string' ||
        !/^[a-f0-9]{64}$/.test(m.key) ||
        !text(m.batch, 100) ||
        typeof m.merchant !== 'string' ||
        m.merchant.length > 200
      )
        throw new Error('账单来源信息无效。');
      if (
        m.timestamp !== undefined &&
        (typeof m.timestamp !== 'string' ||
          !/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(
            m.timestamp,
          ) ||
          !validDate(m.timestamp.slice(0, 10)))
      )
        throw new Error('原始交易时间无效。');
    }
  }
  if (
    x.merchantRules !== undefined &&
    (!Array.isArray(x.merchantRules) ||
      x.merchantRules.length > 2000 ||
      x.merchantRules.some(
        (r) =>
          !r ||
          !['wechat', 'alipay'].includes(r.source) ||
          !text(r.merchant, 200) ||
          !['income', 'expense'].includes(r.kind) ||
          !x.categories[r.kind]?.includes(r.category),
      ))
  )
    throw new Error('商家分类规则无效。');
  for (const g of x.goals) {
    if (
      !g ||
      !text(g.id, 100) ||
      ids.has(g.id) ||
      !text(g.name, 60) ||
      !amount(g.target) ||
      g.target === 0 ||
      !amount(g.saved) ||
      !validDate(g.deadline)
    )
      throw new Error('存款计划数据无效。');
    ids.add(g.id);
    if (g.completed !== undefined && typeof g.completed !== 'boolean')
      throw new Error('计划完成状态无效。');
    if (g.installments !== undefined) {
      if (
        !Array.isArray(g.installments) ||
        !g.installments.length ||
        g.installments.length > 120
      )
        throw new Error('分期安排数量无效。');
      const periodIds = new Set<string>();
      for (const p of g.installments) {
        if (
          !p ||
          !text(p.id, 100) ||
          periodIds.has(p.id) ||
          !validDate(p.date) ||
          !amount(p.cents) ||
          p.cents === 0 ||
          typeof p.done !== 'boolean'
        )
          throw new Error('分期安排数据无效。');
        periodIds.add(p.id);
      }
      if (installmentPaid(g) > g.saved)
        throw new Error(
          '已存金额不能低于已勾选分期的合计。若需撤回该期存款，请先取消相应勾选。',
        );
    }
  }
  return {
    version: 1,
    ...(x.shoppingPlans !== undefined
      ? {
          shoppingPlans: x.shoppingPlans.map((p) => ({
            id: p.id,
            name: p.name,
            items: p.items.map((i) => ({
              id: i.id,
              name: i.name,
              cents: i.cents,
            })),
          })),
        }
      : {}),
    ...(x.currentFunds !== undefined ? { currentFunds: x.currentFunds } : {}),
    categories: {
      income: x.categories.income.includes('退款')
        ? [...x.categories.income]
        : [...x.categories.income, '退款'],
      expense: [
        ...new Set([...x.categories.expense, ...addedExpenseCategories]),
      ],
    },
    entries: x.entries.map(
      ({
        id,
        date,
        time,
        kind,
        category,
        cents,
        note,
        activity,
        importInfo,
      }) => ({
        id,
        date,
        ...(time !== undefined ? { time } : {}),
        kind,
        category,
        cents,
        note,
        ...(activity !== undefined ? { activity } : {}),
        ...(importInfo !== undefined
          ? {
              importInfo: {
                source: importInfo.source,
                key: importInfo.key,
                batch: importInfo.batch,
                merchant: importInfo.merchant,
                ...(importInfo.timestamp
                  ? { timestamp: importInfo.timestamp }
                  : {}),
              },
            }
          : {}),
      }),
    ),
    ...(x.merchantRules !== undefined
      ? {
          merchantRules: x.merchantRules.map(
            ({ source, merchant, kind, category }) => ({
              source,
              merchant,
              kind,
              category,
            }),
          ),
        }
      : {}),
    goals: x.goals.map(
      ({ id, name, target, saved, deadline, installments, completed }) => ({
        id,
        name,
        target,
        saved,
        deadline,
        ...(completed !== undefined ? { completed } : {}),
        ...(installments !== undefined
          ? {
              installments: installments.map(({ id, date, cents, done }) => ({
                id,
                date,
                cents,
                done,
              })),
            }
          : {}),
      }),
    ),
  };
}
export function demoBook(): Book {
  const b = emptyBook();
  const month = today().slice(0, 7);
  b.entries = [
    ['05', 'income', '工资', 1250000, '八月也要好好生活'],
    ['08', 'expense', '住房', 260000, '房租'],
    ['12', 'expense', '工具', 6800, '效率工具订阅'],
    ['16', 'income', '股票', 86000, '已实现收益'],
    ['20', 'expense', '购物', 32800, '换季衣物'],
    ['23', 'expense', '娱乐', 12800, '周末电影'],
    ['25', 'expense', '餐饮', 4600, '和朋友吃晚饭'],
    ['26', 'expense', '交通', 3500, '通勤'],
    ['28', 'expense', '餐饮', 2850, '今日午餐'],
  ].map((r, i) => ({
    id: `demo-${i}`,
    date: `${month}-${r[0]}`,
    kind: r[1] as Kind,
    category: r[2] as string,
    cents: r[3] as number,
    note: r[4] as string,
  }));
  const y = Number(today().slice(0, 4));
  b.goals = [
    {
      id: 'g1',
      name: '给自己一份安全感',
      target: 5000000,
      saved: 2850000,
      deadline: `${y + 1}-06-30`,
    },
    {
      id: 'g2',
      name: '下一站，去看海',
      target: 1200000,
      saved: 420000,
      deadline: `${y}-12-31`,
    },
  ];
  return b;
}

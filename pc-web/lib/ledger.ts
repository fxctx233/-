export type Kind = 'expense' | 'income';
export type Entry = {
  id: string;
  date: string;
  time?: string;
  kind: Kind;
  category: string;
  cents: number;
  note: string;
};
export type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string;
};
export type Book = {
  version: 1;
  entries: Entry[];
  goals: Goal[];
  categories: Record<Kind, string[]>;
};
export const KEY = 'xiaoman-ledger-v1';
export const emptyBook = (): Book => ({
  version: 1,
  entries: [],
  goals: [],
  categories: {
    expense: ['餐饮', '工具', '娱乐', '交通', '住房', '购物', '医疗', '其他'],
    income: ['工资', '股票', '公积金', '奖金', '其他'],
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
  for (const k of ['income', 'expense'] as Kind[]) {
    const c = x.categories[k];
    if (
      !Array.isArray(c) ||
      !c.length ||
      c.length > 200 ||
      c.some((n) => !text(n, 30)) ||
      new Set(c).size !== c.length
    )
      throw new Error('分类数据无效。');
  }
  if (x.entries.length > 50000 || x.goals.length > 1000)
    throw new Error('备份记录数量超出上限（账目 50,000 笔，计划 1,000 个）。');
  const ids = new Set<string>();
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
  }
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
  }
  return {
    version: 1,
    categories: {
      income: [...x.categories.income],
      expense: [...x.categories.expense],
    },
    entries: x.entries.map(
      ({ id, date, time, kind, category, cents, note }) => ({
        id,
        date,
        ...(time !== undefined ? { time } : {}),
        kind,
        category,
        cents,
        note,
      }),
    ),
    goals: x.goals.map(({ id, name, target, saved, deadline }) => ({
      id,
      name,
      target,
      saved,
      deadline,
    })),
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

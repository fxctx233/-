'use client';
import { useEffect, useState, useRef } from 'react';
import { deviceStorage, isAndroidApp } from '@/lib/device';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { InstallmentCalculator } from '@/components/installment-calculator';
import { Progress } from '@/components/ui/progress';
import { ChartContainer } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import {
  Leaf,
  LayoutDashboard,
  ArrowLeftRight,
  Goal as GoalIcon,
  ShieldCheck,
  Plus,
  Download,
  Upload,
  Settings2,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  ArrowLeft,
  Pencil,
  Trash2,
  Database,
  Check,
  Utensils,
  Wrench,
  Gamepad2,
  Bus,
  House,
  ShoppingBag,
  HeartPulse,
  Ellipsis,
  BriefcaseBusiness,
  TrendingUp,
  Landmark,
  Gift,
} from 'lucide-react';
import {
  type Book,
  type Entry,
  type Goal,
  type Kind,
  KEY,
  emptyBook,
  today,
  currentTime,
  money,
  cents,
  validDate,
  periodEntries,
  totals,
  remaining,
  monthsLeft,
  validateBook,
  demoBook,
  entryMoment,
  toggleInstallment,
} from '@/lib/ledger';
type View =
  | 'overview'
  | 'ledger'
  | 'goals'
  | 'settings'
  | 'entry'
  | 'goal'
  | 'deposit'
  | 'complete';
const nav = [
  ['overview', '收支总览', LayoutDashboard],
  ['ledger', '账单明细', ArrowLeftRight],
  ['goals', '存款计划', GoalIcon],
  ['settings', '分类与备份', Settings2],
] as const;
const categoryIcons: Record<string, typeof Leaf> = {
  餐饮: Utensils,
  工具: Wrench,
  娱乐: Gamepad2,
  交通: Bus,
  住房: House,
  购物: ShoppingBag,
  医疗: HeartPulse,
  其他: Ellipsis,
  工资: BriefcaseBusiness,
  股票: TrendingUp,
  公积金: Landmark,
  奖金: Gift,
};
const categoryColors = [
  '#ba774b',
  '#5c94ae',
  '#9b79b6',
  '#4e9c94',
  '#729658',
  '#b7798d',
  '#c26c6b',
  '#86909b',
];
export default function Home() {
  const themes = [
    { id: 'sage', name: '鼠尾草绿', color: '#527d61' },
    { id: 'blue', name: '晴空蓝', color: '#487da4' },
    { id: 'lavender', name: '薰衣草紫', color: '#8770a6' },
    { id: 'rose', name: '玫瑰粉', color: '#b46f87' },
    { id: 'amber', name: '暖杏橙', color: '#aa794a' },
  ];
  const [theme, setTheme] = useState('sage');
  useEffect(() => {
    try {
      const saved = deviceStorage.getItem('xiaoman-theme');
      if (
        saved &&
        ['sage', 'blue', 'lavender', 'rose', 'amber'].includes(saved)
      ) {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {}
  }, []);
  function changeTheme(value: string) {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try {
      deviceStorage.setItem('xiaoman-theme', value);
    } catch {
      setError('配色已应用，但浏览器不允许保存设置，重启后可能恢复默认。');
    }
  }
  const [book, setBook] = useState<Book>(emptyBook),
    [ready, setReady] = useState(false),
    [blocked, setBlocked] = useState(false),
    [demo, setDemo] = useState(false);
  const [view, setView] = useState<View>('overview'),
    [mode, setMode] = useState('month'),
    [date, setDate] = useState(''),
    [filter, setFilter] = useState('all'),
    [query, setQuery] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [edit, setEdit] = useState<Entry | null>(null),
    [goalEdit, setGoalEdit] = useState<Goal | null>(null),
    [kind, setKind] = useState<Kind>('expense'),
    [categoryKind, setCategoryKind] = useState<Kind>('expense');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [historical, setHistorical] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [completedEntry, setCompletedEntry] = useState<Entry | null>(null);
  const [entrySession, setEntrySession] = useState(0);
  const [clockDate, setClockDate] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClockDate(today(now) + ' ' + currentTime(now));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);
  const [pending, setPending] = useState<Book | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const imported = (event: Event) => {
      try {
        setPending(
          validateBook(JSON.parse((event as CustomEvent<string>).detail)),
        );
        setError('');
        setView('settings');
      } catch {
        setError('备份格式无效，现有账目没有修改。');
      }
    };
    const exported = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'saved')
        setMessage('备份已保存到你选择的位置，可复制到电脑。');
      else if (detail === 'cancelled') setMessage('已取消文件操作。');
      else setError(detail);
    };
    window.addEventListener('dailyLedgerImport', imported);
    window.addEventListener('dailyLedgerFileResult', exported);
    return () => {
      window.removeEventListener('dailyLedgerImport', imported);
      window.removeEventListener('dailyLedgerFileResult', exported);
    };
  }, []);
  useEffect(() => {
    const back = (event: Event) => {
      if (view !== 'overview') {
        event.preventDefault();
        go('overview');
      }
    };
    window.addEventListener('dailyLedgerBack', back);
    return () => window.removeEventListener('dailyLedgerBack', back);
  }, [view]);
  useEffect(() => {
    setDate(today());
    try {
      const raw = deviceStorage.getItem(KEY);
      if (raw) setBook(validateBook(JSON.parse(raw)));
    } catch {
      setError(
        '无法读取本地账本。为保护原始数据，已暂停写入；请在“分类与备份”导出原始数据或恢复有效备份。',
      );
      setBlocked(true);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === KEY) {
        setBlocked(true);
        setError('另一个窗口修改了账本。请刷新本页以读取最新数据，防止覆盖。');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  function go(v: View) {
    window.scrollTo({ top: 0 });
    setView(v);
    setMessage('');
    if (!blocked) setError('');
  }
  function commit(next: Book) {
    try {
      validateBook(next);
      if (!demo) {
        if (blocked) throw new Error('账本已暂停写入，请先恢复备份或刷新。');
        deviceStorage.setItem(KEY, JSON.stringify(next));
      }
      setBook(next);
      setError('');
      setMessage(
        demo ? '示例已更新，不影响你的真实账本。' : '已保存到本机浏览器。',
      );
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : '保存失败，请检查浏览器存储空间并导出备份。',
      );
      return false;
    }
  }
  function addEntry(e?: Entry, nextKind: Kind = 'expense') {
    setHistorical(false);
    setEdit(e ?? null);
    setKind(e?.kind ?? nextKind);
    setSelectedCategory(e?.category ?? '');
    setEntrySession((n) => n + 1);
    go('entry');
  }
  function addGoal(g?: Goal) {
    setGoalEdit(g ?? null);
    go('goal');
  }
  function download(data: unknown, name = '日常记账备份') {
    if (isAndroidApp()) {
      window.DailyLedgerAndroid!.exportBackup(
        name + '-' + today() + '.json',
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
      return;
    }
    const blob = new Blob(
      [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function switchDemo() {
    if (demo) {
      try {
        const raw = deviceStorage.getItem(KEY);
        setBook(raw ? validateBook(JSON.parse(raw)) : emptyBook());
        setDemo(false);
        go('overview');
      } catch {
        setError('真实账本无法读取，请先导出并恢复备份。');
      }
    } else {
      setBook(demoBook());
      setDemo(true);
      setDate(today());
      go('overview');
    }
  }
  function saveEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      const amount = cents(String(f.get('amount')));
      if (!amount) throw new Error('金额必须大于零。');
      if (!selectedCategory)
        throw new Error('点一个圆形按钮，选择这笔账目的分类。');
      const now = new Date();
      const entry: Entry = {
        id: edit?.id ?? crypto.randomUUID(),
        ...entryMoment(
          edit,
          historical ? String(f.get('historyDate')) : null,
          String(f.get('historyTime') ?? ''),
          now,
        ),
        kind,
        category: selectedCategory,
        cents: amount,
        note: String(f.get('note') ?? '').trim(),
      };
      if (!validDate(entry.date)) throw new Error('日期无效。');
      const entries = edit
        ? book.entries.map((r) => (r.id === edit.id ? entry : r))
        : [entry, ...book.entries];
      if (commit({ ...book, entries })) {
        setDate(entry.date);
        setCompletedEntry(entry);
        setView('complete');
        setFilter('all');
        setQuery('');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saveGoal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const f = new FormData(e.currentTarget);
      const g: Goal = {
        ...goalEdit,
        id: goalEdit?.id ?? crypto.randomUUID(),
        name: String(f.get('name')).trim(),
        target: cents(String(f.get('target'))),
        saved: cents(String(f.get('saved'))),
        deadline: String(f.get('deadline')),
      };
      if (!g.name || !g.target || !validDate(g.deadline))
        throw new Error('请填写计划名称、有效日期和大于零的目标金额。');
      if (
        commit({
          ...book,
          goals: goalEdit
            ? book.goals.map((x) => (x.id === g.id ? g : x))
            : [...book.goals, g],
        })
      )
        setView('goals');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saveDeposit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!goalEdit) return;
    try {
      const f = new FormData(e.currentTarget);
      const n = cents(String(f.get('amount')));
      if (n === 0) throw new Error('金额必须大于零。');
      const saved = goalEdit.saved + (f.get('direction') === 'out' ? -n : n);
      if (saved < 0) throw new Error('取出金额不能超过已存金额。');
      if (
        commit({
          ...book,
          goals: book.goals.map((g) =>
            g.id === goalEdit.id ? { ...g, saved } : g,
          ),
        })
      )
        setView('goals');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error('备份文件不能超过 10 MB。');
      setPending(validateBook(JSON.parse(await file.text())));
      setError('');
    } catch (e) {
      setPending(null);
      setError('导入失败：' + (e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }
  function restore() {
    if (!pending) return;
    try {
      const old = deviceStorage.getItem(KEY);
      if (old !== null) deviceStorage.setItem(KEY + '-before-restore', old);
      deviceStorage.setItem(KEY, JSON.stringify(pending));
      setBook(pending);
      setDemo(false);
      setBlocked(false);
      setPending(null);
      setError('');
      setMessage('恢复完成，原始账本已保留为恢复前副本。');
    } catch {
      setError(
        '恢复失败，未替换当前账本。请检查浏览器是否允许存储，以及空间是否充足。',
      );
    }
  }
  const period = periodEntries(book, mode, date),
    sum = totals(period),
    shown = period
      .filter(
        (e) =>
          (filter === 'all' || e.kind === filter || e.category === filter) &&
          `${e.note} ${e.category}`.includes(query),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  const prefix = mode === 'year' ? '年' : mode === 'month' ? '月' : '日';
  const unfinished = book.goals.filter(
    (g) => !(g.completed ?? remaining(g) === 0),
  );
  const savedTotal = book.goals.reduce((s, g) => s + g.saved, 0);
  const chartData = Array.from(
    {
      length:
        mode === 'year'
          ? 12
          : mode === 'month' && date
            ? new Date(
                Number(date.slice(0, 4)),
                Number(date.slice(5, 7)),
                0,
              ).getDate()
            : 1,
    },
    (_, i) => {
      const key =
        mode === 'year'
          ? `${date.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`
          : mode === 'month'
            ? `${date.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`
            : date;
      const t = totals(period.filter((e) => e.date.startsWith(key)));
      return {
        name:
          mode === 'year'
            ? `${i + 1}月`
            : mode === 'month'
              ? `${i + 1}`
              : date.slice(5),
        income: t.income / 100,
        expense: t.expense / 100,
      };
    },
  );
  const categoryTotals = book.categories.expense
    .map((name) => ({
      name,
      value: period
        .filter((e) => e.kind === 'expense' && e.category === name)
        .reduce((s, e) => s + e.cents, 0),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const title =
    view === 'overview'
      ? '每一笔，都离目标更近。'
      : view === 'ledger'
        ? '生活的账，一笔一笔记。'
        : view === 'goals'
          ? '把愿望，慢慢存成现实。'
          : view === 'settings'
            ? '你的账本，由你保管。'
            : view === 'entry'
              ? edit
                ? '修改这笔账目'
                : '记下今天的一笔'
              : view === 'goal'
                ? goalEdit
                  ? '调整你的存款计划'
                  : '给愿望定一个目标'
                : '为目标再近一步';
  function goalCard(g: Goal, compact = false) {
    const left = remaining(g),
      months = monthsLeft(g);
    return (
      <article className="goal" key={g.id}>
        <div className="goal-head">
          <h3>{g.name}</h3>
          <span className="badge">
            {(g.completed ?? left === 0)
              ? '已完成'
              : left === 0
                ? '金额已达标'
                : g.deadline < today()
                  ? '已逾期'
                  : '积累中'}
          </span>
        </div>
        <p>
          <b>{money(g.saved)}</b>{' '}
          <span className="muted">/ {money(g.target)}</span>
        </p>
        <Progress
          aria-label={`${g.name}完成进度`}
          value={Math.min(100, Math.round((g.saved / g.target) * 100))}
          className="my-4"
        />
        <div className="goal-head">
          <small>还差 {money(left)}</small>
          <small>
            {Math.min(100, Math.round((g.saved / g.target) * 100))}%
          </small>
        </div>
        <p className="muted">
          {g.deadline} 截止
          {left > 0
            ? months > 0
              ? ` · 每月约存 ${money(Math.ceil(left / months))}`
              : ' · 目标已到期，请调整计划'
            : ' · 目标达成，真好！'}
        </p>
        {!compact && (
          <>
            <label className="goal-complete-toggle">
              <Checkbox
                checked={g.completed ?? left === 0}
                onCheckedChange={(checked) =>
                  commit({
                    ...book,
                    goals: book.goals.map((x) =>
                      x.id === g.id ? { ...x, completed: checked } : x,
                    ),
                  })
                }
              />
              手动标记整个计划已完成
            </label>
            <p className="muted">
              取消勾选可重新开启计划；此开关不改变已存金额。
            </p>
            {g.installments && (
              <details className="installment-list" open>
                <summary>
                  分期安排 · {g.installments.filter((p) => p.done).length}/
                  {g.installments.length} 期完成
                </summary>
                <div className="installment-rows">
                  {g.installments.map((p, i) => (
                    <label
                      key={p.id}
                      className={`installment-row ${p.done ? 'is-done' : ''}`}
                    >
                      <Checkbox
                        aria-label={`${g.name}第${i + 1}期完成`}
                        checked={p.done}
                        onCheckedChange={(checked) => {
                          try {
                            const updated = toggleInstallment(g, p.id, checked);
                            commit({
                              ...book,
                              goals: book.goals.map((x) =>
                                x.id === g.id ? updated : x,
                              ),
                            });
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      />
                      <span>
                        第 {i + 1} 期{' '}
                        <small>
                          {p.date}
                          {!p.done && p.date < today() ? ' · 已到期' : ''}
                        </small>
                      </span>
                      <b>{money(p.cents)}</b>
                      <small>{p.done ? '已完成 · 可取消' : '待存入'}</small>
                    </label>
                  ))}
                </div>
                <p className="muted">
                  实际存好后再勾选：计入该期金额；取消勾选会撤回。不要再通过“存入”重复录入。若需取出已勾选的存款，请先取消相应期次。
                </p>
              </details>
            )}
            <div className="flex">
              <Button
                variant="secondary"
                onClick={() => {
                  setGoalEdit(g);
                  go('deposit');
                }}
              >
                <Plus />
                存入 / 取出
              </Button>
              <Button
                variant="ghost"
                onClick={() => addGoal(g)}
                aria-label={`编辑${g.name}`}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                aria-label={`删除${g.name}`}
                onClick={() => {
                  if (confirm(`删除“${g.name}”？不会修改收支账目。`))
                    commit({
                      ...book,
                      goals: book.goals.filter((x) => x.id !== g.id),
                    });
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </>
        )}
      </article>
    );
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Leaf />
          日常记账<span>把日子过成一点点积累</span>
        </div>
        <nav>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={
                view === id ||
                (id === 'ledger' && ['entry', 'complete'].includes(view)) ||
                (id === 'goals' && ['goal', 'deposit'].includes(view))
                  ? 'active'
                  : ''
              }
              onClick={() => go(id)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="privacy">
          <ShieldCheck />
          只留在你的设备
          <br />
          <small>本地保存 · 无需登录</small>
          <p className="muted">
            小小的记录，
            <br />
            也是认真生活的证据。
          </p>
        </div>
      </aside>
      <main
        className={`main ${view === 'entry' || view === 'complete' ? 'focused-entry' : ''}`}
      >
        <div className="theme-picker" role="group" aria-label="界面配色">
          <span>界面配色</span>
          {themes.map((t) => (
            <Button
              key={t.id}
              type="button"
              className="theme-swatch"
              style={{ backgroundColor: t.color }}
              aria-label={t.name}
              title={t.name}
              aria-pressed={theme === t.id}
              onClick={() => changeTheme(t.id)}
            >
              {theme === t.id && <Check />}
            </Button>
          ))}
          <small>{themes.find((t) => t.id === theme)?.name}</small>
        </div>
        <section className="quick-actions" aria-label="快速记账">
          {(['expense', 'income'] as Kind[]).map((k) => (
            <div className="quick-action-item" key={k}>
              <Button
                className={`entry-kind-circle ${k} ${view === 'entry' && kind === k ? 'is-active' : ''}`}
                aria-pressed={view === 'entry' && kind === k}
                disabled={!ready || (blocked && !demo)}
                onClick={() => {
                  if (view === 'entry' && kind === k) return;
                  addEntry(undefined, k);
                }}
              >
                {k === 'income' ? <ArrowDownRight /> : <ArrowUpRight />}
                <span>{k === 'income' ? '收入' : '支出'}</span>
              </Button>
              <small>{k === 'income' ? '记下一份收获' : '记下一笔花费'}</small>
            </div>
          ))}
        </section>
        {view !== 'entry' && view !== 'complete' && (
          <header>
            <div>
              <p className="eyebrow">DAILY LEDGER / 日常记账</p>
              <h1>{title}</h1>
              <p className="muted">
                {view === 'overview'
                  ? '看清日常收支，为想要的生活慢慢积累。'
                  : view === 'settings'
                    ? '无需账号，不上传账目。请定期导出一份备份。'
                    : '不必着急，一点一滴，也在向前。'}
              </p>
            </div>
            <div className="flex">
              {view === 'goals' && (
                <Button onClick={() => addGoal()}>
                  <Plus />
                  新建计划
                </Button>
              )}
            </div>
          </header>
        )}
        {!ready && <div className="notice">正在读取本地账本…</div>}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        {demo && (
          <div className="notice toolbar">
            <span>示例模式 · 所有金额都是演示数据，修改不会影响真实账本。</span>
            <Button variant="outline" onClick={switchDemo}>
              返回我的账本
            </Button>
          </div>
        )}
        {ready && !demo && book.entries.length === 0 && view === 'overview' && (
          <div className="notice toolbar">
            <span>欢迎来到你的新账本。直接记一笔，或先用示例看看效果。</span>
            <Button variant="outline" onClick={switchDemo}>
              看看示例账本
            </Button>
          </div>
        )}
        {['overview', 'ledger'].includes(view) && (
          <>
            <div className="toolbar">
              <div className="flex">
                <div className="segmented">
                  {[
                    ['year', '年'],
                    ['month', '月'],
                    ['day', '日'],
                  ].map(([id, n]) => (
                    <button
                      key={id}
                      className={mode === id ? 'chosen' : ''}
                      onClick={() => setMode(id)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <Input
                  aria-label="统计日期"
                  type={
                    mode === 'year'
                      ? 'number'
                      : mode === 'month'
                        ? 'month'
                        : 'date'
                  }
                  min={mode === 'year' ? '1900' : '1900-01-01'}
                  max={mode === 'year' ? '9999' : '9999-12-31'}
                  value={
                    mode === 'year'
                      ? date.slice(0, 4)
                      : mode === 'month'
                        ? date.slice(0, 7)
                        : date
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (
                      mode === 'year' &&
                      /^\d{4}$/.test(v) &&
                      Number(v) >= 1900
                    )
                      setDate(v + '-01-01');
                    else if (mode === 'month' && /^\d{4}-\d{2}$/.test(v))
                      setDate(v + '-01');
                    else if (mode === 'day' && validDate(v)) setDate(v);
                  }}
                  className="w-40 bg-white"
                />
              </div>
              <span className="muted">
                <span className="status-dot" />
                {demo
                  ? '示例账本'
                  : blocked
                    ? '存储需处理'
                    : '数据仅存本机'} ·{' '}
                {book.entries.length} 笔记录
              </span>
            </div>
            <section className="stats">
              <article className="stat featured">
                <p>
                  所选{prefix}结余{' '}
                  <ArrowUpRight size={15} className="float-right" />
                </p>
                <strong>{money(sum.balance)}</strong>
                <small>收入 − 支出，不等于实际存款</small>
              </article>
              <article className="stat">
                <p>
                  所选{prefix}收入{' '}
                  <ArrowUpRight size={15} className="float-right" />
                </p>
                <strong>{money(sum.income)}</strong>
                <small>
                  {period.filter((e) => e.kind === 'income').length} 笔收入 ·
                  每一份收获都值得记录
                </small>
              </article>
              <article className="stat">
                <p>
                  所选{prefix}支出{' '}
                  <ArrowDownRight size={15} className="float-right" />
                </p>
                <strong>{money(sum.expense)}</strong>
                <small>
                  {period.filter((e) => e.kind === 'expense').length} 笔支出 ·
                  让花费心中有数
                </small>
              </article>
            </section>
          </>
        )}
        {view === 'overview' && (
          <>
            <div className="two-cols">
              <section className="panel">
                <div className="toolbar">
                  <h2>收支趋势</h2>
                  <span className="muted">
                    <span className="positive">● 收入</span>　
                    <span className="negative">● 支出</span>
                  </span>
                </div>
                <p className="muted">
                  {mode === 'year'
                    ? '按月'
                    : mode === 'month'
                      ? '按日'
                      : '当天'}
                  汇总 · 单位：元
                </p>
                {period.length ? (
                  <ChartContainer
                    config={{
                      income: { label: '收入', color: '#739879' },
                      expense: { label: '支出', color: '#c5aa7f' },
                    }}
                    className="h-[220px] w-full"
                  >
                    <BarChart data={chartData} barGap={3}>
                      <CartesianGrid vertical={false} strokeDasharray="3 4" />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        minTickGap={20}
                      />
                      <YAxis axisLine={false} tickLine={false} width={45} />
                      <Tooltip
                        formatter={(v, n) => [
                          money(Number(v) * 100),
                          n === 'income' ? '收入' : '支出',
                        ]}
                      />
                      <Bar
                        dataKey="income"
                        fill="#739879"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={22}
                      />
                      <Bar
                        dataKey="expense"
                        fill="#c5aa7f"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <div className="empty">
                    这段时间还没有记录
                    <br />
                    <Button variant="link" onClick={() => addEntry()}>
                      记下第一笔 →
                    </Button>
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="toolbar">
                  <h2>支出花在哪里</h2>
                  <span className="badge">分类统计</span>
                </div>
                {categoryTotals.length ? (
                  categoryTotals.slice(0, 5).map((c, i) => (
                    <div key={c.name}>
                      <div className="total-line">
                        <span>
                          <i
                            style={{
                              background: [
                                '#7e9b76',
                                '#b9c398',
                                '#c6ad87',
                                '#8daca3',
                                '#b7a69a',
                              ][i],
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: 3,
                              marginRight: 8,
                            }}
                          />
                          {c.name}
                        </span>
                        <span>
                          {money(c.value)}{' '}
                          <small className="muted">
                            {((c.value / sum.expense) * 100).toFixed(1)}%
                          </small>
                        </span>
                      </div>
                      <Progress
                        value={(c.value / sum.expense) * 100}
                        aria-label={`${c.name}支出占比`}
                      />
                    </div>
                  ))
                ) : (
                  <div className="empty">每一笔花费，都会在这里汇总。</div>
                )}
                {categoryTotals.length > 5 && (
                  <p className="muted">
                    另有 {categoryTotals.length - 5}{' '}
                    个分类；完整汇总见账单明细。
                  </p>
                )}
              </section>
            </div>
            <section className="panel">
              <div className="toolbar">
                <h2>
                  我的存款计划 <span className="muted">给未来留一点期待</span>
                </h2>
                <Button variant="ghost" onClick={() => go('goals')}>
                  管理计划 →
                </Button>
              </div>
              {book.goals.length ? (
                <div className="backup-grid">
                  {book.goals.slice(0, 2).map((g) => goalCard(g, true))}
                </div>
              ) : (
                <div className="empty">
                  第一笔存款，从一个小目标开始。
                  <br />
                  <Button variant="link" onClick={() => addGoal()}>
                    创建存款计划 →
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
        {['overview', 'ledger'].includes(view) && (
          <section className="panel">
            <div className="toolbar">
              <h2>{view === 'overview' ? '最近账目' : '账单明细'}</h2>
              {view === 'overview' ? (
                <Button variant="ghost" onClick={() => go('ledger')}>
                  查看全部 →
                </Button>
              ) : (
                <div className="flex">
                  <select
                    aria-label="分类筛选"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">全部收支</option>
                    <option value="income">全部收入</option>
                    <option value="expense">全部支出</option>
                    {Array.from(
                      new Set([
                        ...book.categories.expense,
                        ...book.categories.income,
                      ]),
                    ).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <Input
                    aria-label="搜索备注或分类"
                    placeholder="搜索备注或分类"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
            </div>
            {view === 'ledger' && (
              <p className="muted">
                筛选结果 {shown.length} 笔 · 收入 {money(totals(shown).income)}{' '}
                · 支出 {money(totals(shown).expense)}
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>日期 / 时间</th>
                    <th>分类</th>
                    <th>备注</th>
                    <th style={{ textAlign: 'right' }}>金额</th>
                    <th style={{ textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(view === 'overview' ? shown.slice(0, 5) : shown).map(
                    (e) => (
                      <tr key={e.id}>
                        <td className="record-date">
                          {e.date}
                          <small className="record-time">
                            {e.time ?? '未记录时间'}
                          </small>
                        </td>
                        <td className="record-category">
                          <span className="category">{e.category}</span>
                        </td>
                        <td className="record-note">{e.note || '无备注'}</td>
                        <td
                          className={`money ${e.kind === 'income' ? 'positive' : 'negative'}`}
                        >
                          {e.kind === 'income' ? '+' : '−'}
                          {money(e.cents)}
                        </td>
                        <td
                          className="record-actions"
                          style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                        >
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`编辑${e.date}${e.category}`}
                            onClick={() => addEntry(e)}
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`删除${e.date}${e.category}`}
                            onClick={() => {
                              if (
                                confirm(
                                  `删除这笔${e.category} ${money(e.cents)}？`,
                                )
                              )
                                commit({
                                  ...book,
                                  entries: book.entries.filter(
                                    (x) => x.id !== e.id,
                                  ),
                                });
                            }}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {!shown.length && (
                <div className="empty">这段时间没有符合条件的账目。</div>
              )}
            </div>
          </section>
        )}
        {view === 'ledger' && categoryTotals.length > 0 && (
          <section className="panel">
            <h2>所选期间 · 支出分类汇总</h2>
            <div className="category-summary">
              {categoryTotals.map((c) => (
                <span key={c.name} className="category">
                  {c.name}　{money(c.value)}
                </span>
              ))}
            </div>
          </section>
        )}
        {view === 'goals' && (
          <>
            <div className="calculator-entry">
              <div>
                <h2>把一个目标，拆成每月的小计划</h2>
                <p className="muted">
                  填入旅行、购物或备用金预算，比较几种分期存款安排。
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setShowCalculator((v) => !v)}
              >
                {showCalculator ? '收起计算器' : '打开分期存款计算器'}
              </Button>
            </div>
            {showCalculator && (
              <InstallmentCalculator
                onCreate={(goal) => {
                  const ok = commit({ ...book, goals: [...book.goals, goal] });
                  if (ok) setShowCalculator(false);
                  return ok;
                }}
              />
            )}
            <div className="notice">
              <Bell size={17} />
              <span>
                {unfinished.length
                  ? `你有 ${unfinished.length} 个目标待完成，还需存入 ${money(unfinished.reduce((s, g) => s + remaining(g), 0))}。`
                  : '每一次积累，都值得被看见。'}{' '}
                当前为应用内进度提醒，关闭网页后不会通知。
              </span>
            </div>
            <section className="stats">
              <article className="stat featured">
                <p>计划累计已存</p>
                <strong>{money(savedTotal)}</strong>
                <small>手动分配的存款，不重复计入收支</small>
              </article>
              <article className="stat">
                <p>进行中的目标</p>
                <strong>
                  {unfinished.length}{' '}
                  <small style={{ display: 'inline' }}>个</small>
                </strong>
                <small>每月建议按含本月的剩余自然月均摊</small>
              </article>
              <article className="stat">
                <p>已经完成</p>
                <strong>
                  {book.goals.length - unfinished.length}{' '}
                  <small style={{ display: 'inline' }}>个</small>
                </strong>
                <small>让期待，一件件发生</small>
              </article>
            </section>
            <div className="backup-grid">
              {book.goals.map((g) => (
                <section className="panel" key={g.id}>
                  {goalCard(g)}
                </section>
              ))}
            </div>
            {!book.goals.length && (
              <div className="panel empty">
                还没有存款计划。
                <Button variant="link" onClick={() => addGoal()}>
                  创建第一个目标
                </Button>
              </div>
            )}
            <p className="muted">
              分期完成状态会随备份保存。普通存入/取出暂不保留逐笔历史；请勿把同一笔存款分配给多个目标。
            </p>
          </>
        )}
        {view === 'entry' && (
          <section className={`quick-entry ${kind}`}>
            <div className="entry-caption">
              <span>
                {edit
                  ? '修改账目'
                  : kind === 'income'
                    ? '记一笔收入'
                    : '记一笔支出'}
              </span>
              <span className="entry-date">
                {historical
                  ? '补记模式 · 按下方日期保存'
                  : edit
                    ? edit.date +
                      ' ' +
                      (edit.time ?? '未记录时间') +
                      ' · 保留原时间'
                    : (clockDate || '今天') + ' · 自动记录当前时间'}
              </span>
            </div>
            <form key={entrySession} onSubmit={saveEntry}>
              <div className="history-option">
                <label className="history-toggle">
                  <Checkbox
                    checked={historical}
                    onCheckedChange={setHistorical}
                  />
                  特殊选项：补记历史账目 / 修改日期
                </label>
                {historical && (
                  <div className="history-fields">
                    <label>
                      账目日期
                      <Input
                        type="date"
                        name="historyDate"
                        required
                        min="1900-01-01"
                        max={today()}
                        defaultValue={edit?.date ?? today()}
                      />
                    </label>
                    <label>
                      具体时间（选填）
                      <Input
                        type="time"
                        name="historyTime"
                        defaultValue={edit?.time ?? ''}
                      />
                    </label>
                    <p className="muted">
                      保存到指定日期，并自动归入对应年月日统计。忘记时间可以留空，不会补成当前时间。
                    </p>
                  </div>
                )}
              </div>
              <label className="amount-label" htmlFor="quick-amount">
                {kind === 'income' ? '这次收入多少？' : '这次花了多少？'}
              </label>
              <div className="amount-field">
                <span>¥</span>
                <Input
                  id="quick-amount"
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={edit ? (edit.cents / 100).toFixed(2) : ''}
                  autoFocus
                  maxLength={12}
                  autoComplete="off"
                />
              </div>
              <fieldset className="category-picker">
                <legend>
                  选择分类 <small>点击一个圆圈就好</small>
                </legend>
                <div className="circle-category-grid">
                  {book.categories[kind].map((c, i) => {
                    const Icon = categoryIcons[c] ?? Ellipsis;
                    const color = categoryColors[i % categoryColors.length];
                    return (
                      <div className="circle-category-item" key={c}>
                        <Button
                          type="button"
                          aria-label={c}
                          aria-pressed={selectedCategory === c}
                          className={`category-circle ${selectedCategory === c ? 'selected' : ''}`}
                          style={
                            { '--category-color': color } as React.CSSProperties
                          }
                          onClick={() => setSelectedCategory(c)}
                        >
                          <Icon />
                          {selectedCategory === c && (
                            <span className="category-tick">
                              <Check />
                            </span>
                          )}
                        </Button>
                        <span
                          className={
                            selectedCategory === c
                              ? 'category-name picked'
                              : 'category-name'
                          }
                        >
                          {c}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
              <div className="round-confirm-area">
                <div className="confirm-note-row">
                  <label className="confirm-note">
                    备注（可选）
                    <Input
                      name="note"
                      placeholder="例如：午饭、打车回家…"
                      maxLength={300}
                      defaultValue={edit?.note ?? ''}
                    />
                  </label>
                  <Button
                    type="submit"
                    className="round-confirm"
                    disabled={!selectedCategory || !ready || (blocked && !demo)}
                    aria-label="确认记录"
                  >
                    <Check />
                    <span>确认</span>
                  </Button>
                </div>
                <p>
                  {selectedCategory
                    ? '已选「' + selectedCategory + '」 · 点一下，记录完成'
                    : '输入金额，选择分类，再点确认'}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => go('overview')}
                >
                  取消记录
                </Button>
              </div>
            </form>
          </section>
        )}
        {view === 'complete' && completedEntry && (
          <section className="entry-complete" aria-live="polite">
            <div className="complete-circle">
              <Check />
            </div>
            <h2>记录完成</h2>
            <p className="complete-amount">
              {completedEntry.kind === 'income' ? '+' : '−'}{' '}
              {money(completedEntry.cents)}
            </p>
            <p className="muted">
              {completedEntry.category} · {completedEntry.date}{' '}
              {completedEntry.time ?? '（未记录时间）'}
            </p>
            {completedEntry.note && (
              <p className="completion-note">{completedEntry.note}</p>
            )}
            <p className="muted">
              {demo
                ? '这是示例记录，不会影响真实账本。'
                : '已保存在本机，今天又认真记录了一笔。'}
            </p>
            <div className="completion-actions">
              <Button onClick={() => addEntry(undefined, completedEntry.kind)}>
                再记一笔
              </Button>
              <Button variant="outline" onClick={() => go('ledger')}>
                查看账单
              </Button>
            </div>
          </section>
        )}
        {view === 'goal' && (
          <section className="panel form-panel">
            <Button variant="ghost" onClick={() => go('goals')}>
              <ArrowLeft />
              返回计划
            </Button>
            <form
              key={goalEdit?.id ?? 'new'}
              onSubmit={saveGoal}
              className="mt-6"
            >
              <div className="form-grid">
                <label className="full">
                  计划名称
                  <Input
                    name="name"
                    required
                    maxLength={60}
                    defaultValue={goalEdit?.name ?? ''}
                    placeholder="例如：攒一份应急备用金"
                  />
                </label>
                <label>
                  目标金额（元）
                  <Input
                    name="target"
                    required
                    inputMode="decimal"
                    defaultValue={
                      goalEdit ? (goalEdit.target / 100).toFixed(2) : ''
                    }
                    placeholder="50000.00"
                  />
                </label>
                <label>
                  当前已存（元）
                  <Input
                    name="saved"
                    required
                    inputMode="decimal"
                    defaultValue={
                      goalEdit ? (goalEdit.saved / 100).toFixed(2) : '0.00'
                    }
                  />
                </label>
                <label>
                  目标截止日期
                  <Input
                    name="deadline"
                    type="date"
                    required
                    min="1900-01-01"
                    max="9999-12-31"
                    defaultValue={
                      goalEdit?.deadline ??
                      `${Number(today().slice(0, 4)) + 1}-12-31`
                    }
                  />
                </label>
              </div>
              <p className="notice">
                存款计划独立于收支账目。存入存款不计为支出，取出不计为收入。
              </p>
              <div className="form-actions">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => go('goals')}
                >
                  取消
                </Button>
                <Button type="submit">保存计划</Button>
              </div>
            </form>
          </section>
        )}
        {view === 'deposit' && goalEdit && (
          <section className="panel form-panel">
            <h2>{goalEdit.name}</h2>
            <p className="muted">
              当前已存 {money(goalEdit.saved)} · 还差{' '}
              {money(remaining(goalEdit))}
            </p>
            <form onSubmit={saveDeposit}>
              <div className="form-grid">
                <label>
                  操作
                  <select name="direction">
                    <option value="in">存入</option>
                    <option value="out">取出</option>
                  </select>
                </label>
                <label>
                  金额（元）
                  <Input
                    name="amount"
                    inputMode="decimal"
                    required
                    placeholder="0.00"
                    autoFocus
                  />
                </label>
              </div>
              <div className="form-actions">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => go('goals')}
                >
                  取消
                </Button>
                <Button type="submit">确认更新</Button>
              </div>
            </form>
          </section>
        )}
        {view === 'settings' && (
          <>
            <section className="panel">
              <div className="toolbar">
                <h2>分类管理</h2>
                <select
                  value={categoryKind}
                  onChange={(e) => setCategoryKind(e.target.value as Kind)}
                  aria-label="管理分类类型"
                >
                  <option value="expense">支出分类</option>
                  <option value="income">收入分类</option>
                </select>
              </div>
              <div className="category-summary">
                {book.categories[categoryKind].map((c) => (
                  <span className="category" key={c}>
                    {c}
                  </span>
                ))}
              </div>
              <form
                className="flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = e.currentTarget;
                  const name = String(new FormData(f).get('name')).trim();
                  if (!name || book.categories[categoryKind].includes(name)) {
                    setError('分类名称不能为空或重复。');
                    return;
                  }
                  if (
                    commit({
                      ...book,
                      categories: {
                        ...book.categories,
                        [categoryKind]: [
                          ...book.categories[categoryKind],
                          name,
                        ],
                      },
                    })
                  )
                    f.reset();
                }}
              >
                <Input
                  name="name"
                  placeholder="新分类名称"
                  maxLength={30}
                  required
                  className="max-w-64"
                />
                <Button type="submit" variant="secondary">
                  <Plus />
                  添加分类
                </Button>
              </form>
              <p className="muted">
                预览版支持新增分类；已用分类保留，避免历史账目失去归属。
              </p>
            </section>
            <div className="backup-grid">
              <section className="panel">
                <Download size={24} className="mb-4 text-primary" />
                <h2>导出一份安心</h2>
                <p className="muted">
                  一个 JSON 文件包含账目、分类和存款计划。可以复制到电脑、U
                  盘或手机保管。
                </p>
                <Button
                  onClick={() =>
                    download(book, demo ? '日常记账示例账本' : '日常记账备份')
                  }
                >
                  导出{demo ? '示例' : '完整'}备份
                </Button>
                <p className="muted">备份为明文，请妥善保管，不要公开分享。</p>
              </section>
              <section className="panel">
                <Upload size={24} className="mb-4 text-primary" />
                <h2>从备份恢复</h2>
                <p className="muted">
                  恢复会完整替换真实账本，不自动合并。恢复前会在此浏览器保留上一份原始数据。
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    isAndroidApp()
                      ? window.DailyLedgerAndroid!.importBackup()
                      : fileRef.current?.click()
                  }
                >
                  选择备份文件
                </Button>
                <p className="muted">最多 10 MB · 日常记账备份格式 v1</p>
              </section>
            </div>
            {pending && (
              <section className="panel mt-5">
                <h2>确认恢复这份备份？</h2>
                <p className="muted">
                  {pending.entries.length} 笔账目，{pending.goals.length}{' '}
                  个计划。现有真实账本将被替换。
                </p>
                <div className="flex">
                  <Button onClick={restore}>确认替换并恢复</Button>
                  <Button variant="outline" onClick={() => setPending(null)}>
                    取消
                  </Button>
                </div>
              </section>
            )}
            <section className="panel mt-5">
              <div className="toolbar">
                <h2>
                  <Database size={18} className="inline mr-2" />
                  本地数据说明
                </h2>
                <span className="badge">
                  约{' '}
                  {(
                    new TextEncoder().encode(JSON.stringify(book)).length / 1024
                  ).toFixed(1)}{' '}
                  KB
                </span>
              </div>
              <p className="muted">
                {isAndroidApp()
                  ? '账目保存在本应用专属的 SQLite 数据库中，不上传服务器。卸载应用或清除应用数据前请先导出备份。手机与电脑之间通过备份文件手动转移，不会自动同步。'
                  : '账目保存在当前浏览器本地，不上传服务器。清理浏览器数据、更换浏览器、地址或端口前，请先导出备份。无痕模式不适合长期保存。'}
              </p>
              <p className="muted">
                {isAndroidApp()
                  ? '安卓离线版 · 无网络权限。应用包含完整界面，不需要连接网页或启动电脑。备份是明文文件，请妥善保管。'
                  : '这是网页版本。本地版、在线版和安卓应用的账本各自独立，切换时请先导出再导入备份。'}
              </p>
              <div className="flex flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    const s = deviceStorage.getItem(KEY + '-before-restore');
                    if (s) download(s, '日常记账恢复前副本');
                    else setMessage('目前没有恢复前副本。');
                  }}
                >
                  导出恢复前副本
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const s = deviceStorage.getItem(KEY);
                    if (s) download(s, '日常记账原始数据');
                    else setMessage('暂无已保存原始数据。');
                  }}
                >
                  导出原始数据
                </Button>
                <Button variant="ghost" onClick={switchDemo}>
                  {demo ? '返回真实账本' : '体验示例账本'}
                </Button>
              </div>
            </section>
          </>
        )}
        <footer className="footer">
          日常记账，每天积累一点点。　·　本地离线账本 v0.1
        </footer>
      </main>
    </div>
  );
}

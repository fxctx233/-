'use client';
import './bill-importer.css';
import { useEffect, useRef, useState } from 'react';
import {
  Upload,
  ShieldCheck,
  ArrowLeft,
  Check,
  FileSpreadsheet,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { money, cents, type Book, type Kind } from '@/lib/ledger';
import {
  buildImportedBook,
  markDuplicates,
  sourceName,
  summarizeBills,
  reclassifyImported,
  type BillRow,
} from '@/lib/bill-import';
import { readBillFile } from '@/lib/bill-files';

export function BillImporter({
  book,
  disabled,
  demo,
  onCommit,
  onBack,
  onBackup,
}: {
  book: Book;
  disabled: boolean;
  demo: boolean;
  onCommit: (next: Book) => boolean;
  onBack: () => void;
  onBackup: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BillRow[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [tab, setTab] = useState('all'),
    [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [page, setPage] = useState(0),
    [category, setCategory] = useState(''),
    [activity, setActivity] = useState('');
  const [reviewed, setReviewed] = useState(false),
    [confirming, setConfirming] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  useEffect(() => {
    if (!rows.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [rows.length]);
  const selection = rows.filter((r) => r.include);
  const existingUpdate = reclassifyImported(book, rows);
  const unclassified = selection.filter((r) => !r.category);
  const shown = rows.filter(
    (r) =>
      (sourceFilter === 'all' || r.source === sourceFilter) &&
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      `${r.merchant} ${r.description} ${r.category} ${r.activity} ${sourceName(r.source)}`.includes(
        search,
      ) &&
      (tab === 'all' ||
        (tab === 'review' && r.possibleDuplicate) ||
        (tab === 'selected' && r.include) ||
        (tab === 'skipped' && !r.include)),
  );
  const spending = summarizeBills(shown);
  const pageCount = Math.max(1, Math.ceil(shown.length / 30));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(currentPage * 30, currentPage * 30 + 30);
  const lastBatch = book.entries
    .flatMap((e) => (e.importInfo ? [e.importInfo.batch] : []))
    .sort()
    .at(-1);
  const lastCount = book.entries.filter(
    (e) => e.importInfo?.batch === lastBatch && lastBatch,
  ).length;
  const total = (kind: Kind) =>
    selection
      .filter((r) => r.kind === kind)
      .reduce((sum, r) => {
        try {
          return sum + cents(r.amount);
        } catch {
          return sum;
        }
      }, 0);
  function update(id: string, patch: Partial<BillRow>) {
    setRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setReviewed(false);
    setConfirming(false);
  }
  async function load(files: File[]) {
    if (!files.length) return;
    if (files.length > 8) {
      setError('一次最多选择 8 份账单。');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    setConfirming(false);
    setReviewed(false);
    const errors: string[] = [],
      added: BillRow[] = [];
    for (const file of files) {
      try {
        added.push(...(await readBillFile(file, book)));
      } catch (e) {
        errors.push(`${file.name}：${(e as Error).message}`);
      }
    }
    if (rows.length + added.length > 50000)
      setError('本次预览不能超过 50,000 条，请分批处理。');
    else setRows(markDuplicates([...rows, ...added], book));
    setFileErrors(errors);
    setBusy(false);
    setPage(0);
    if (input.current) input.current.value = '';
  }
  function bulk(field: 'category' | 'activity') {
    const ids = new Set(shown.filter((r) => r.include).map((r) => r.id));
    const value = (field === 'category' ? category : activity).trim();
    if (!ids.size) {
      setError('请先勾选当前筛选结果中的账目。');
      return;
    }
    if (field === 'category' && !value) {
      setError('请选择批量分类。');
      return;
    }
    if (
      field === 'category' &&
      shown.some(
        (r) => ids.has(r.id) && !book.categories[r.kind].includes(value),
      )
    ) {
      setError('所选账目包含不适用此分类的收支类型，请分别处理。');
      return;
    }
    setRows((rows) =>
      rows.map((r) => (ids.has(r.id) ? { ...r, [field]: value } : r)),
    );
    setError('');
    setReviewed(false);
    setConfirming(false);
  }
  function finish() {
    try {
      const batch =
        new Date().toISOString() + '-' + crypto.randomUUID().slice(0, 8);
      const next = buildImportedBook(book, rows, batch);
      if (!onCommit(next)) {
        setError('保存未成功，预览已保留。请查看页面提示并重试。');
        return;
      }
      const count = selection.length;
      const selectedIds = new Set(selection.map((r) => r.id));
      setRows((rows) =>
        markDuplicates(
          rows.map((r) =>
            selectedIds.has(r.id) ? { ...r, include: false } : r,
          ),
          next,
        ),
      );
      setSuccess(
        `已追加 ${count} 笔账目，原有记录未被替换。统计按每笔原交易日期计算。未导入的记录仍可继续处理。`,
      );
      setConfirming(false);
      setReviewed(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    }
  }
  return (
    <section className="bill-importer">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft />
        返回账单
      </Button>
      <div className="panel import-intro">
        <div>
          <span className="badge">本地导入 · 预览后再保存</span>
          <h2>把账单整理成你的账本</h2>
          <p className="muted">
            选择支付宝 CSV、微信 XLSX /
            CSV，可同时导入。原始文件不上传、不修改，确认后追加到账本。
          </p>
        </div>
        <Button
          onClick={() => input.current?.click()}
          disabled={busy || disabled || demo}
        >
          <Upload />
          {busy
            ? '正在本地读取…'
            : rows.length
              ? '继续添加文件'
              : '选择账单文件'}
        </Button>
        <input
          ref={input}
          aria-label="选择微信或支付宝账单"
          type="file"
          accept=".csv,.xlsx"
          multiple
          hidden
          onChange={(e) => void load(Array.from(e.target.files ?? []))}
        />
        <p className="import-privacy">
          <ShieldCheck size={15} />
          只提取记账所需字段，不保存对方账号和原始订单号。单文件 ≤ 10 MB。
        </p>
        {demo && <p role="alert">请先返回真实账本，再导入个人账单。</p>}
        <div className="import-steps">
          <span>01 选择文件</span>
          <span>02 自动分类 · 只看可疑订单</span>
          <span>03 确认追加到账本</span>
        </div>
      </div>
      {error && (
        <p className="import-alert" role="alert">
          {error}
        </p>
      )}
      {fileErrors.length > 0 && (
        <div className="import-alert" role="alert">
          <b>以下文件没有导入预览：</b>
          {fileErrors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {success && <output className="import-success">{success}</output>}
      {!rows.length && (
        <div className="panel import-empty">
          <FileSpreadsheet size={38} />
          <h2>先选文件，不会立即记账</h2>
          <p>在支付宝、微信导出时选择“用于个人对账”，邮件中的 ZIP 先解压。</p>
          <p className="muted">
            普通交易自动分类并勾选，退款到账归为退款收入；只有年月日时分秒完全相同的不同订单才提示可疑。分类可批量修改。
          </p>
          <Button variant="outline" onClick={onBackup}>
            先导出当前账本备份
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <>
          {existingUpdate.matched > 0 && (
            <div className="panel">
              <h2>已入账记录无需重新导入</h2>
              <p className="muted">
                已匹配 {existingUpdate.matched} 笔旧记录，其中{' '}
                {existingUpdate.changed}{' '}
                笔分类或收支方向可按新规则更新。只更新分类、方向和原交易时间信息，保留已保存的金额、日期、备注和活动标签。
              </p>
              <Button
                variant="outline"
                disabled={disabled || busy || demo}
                onClick={() => {
                  const result = reclassifyImported(book, rows);
                  if (onCommit(result.book)) {
                    setSuccess(
                      `已按新规则更新 ${result.changed} 笔旧分类，并补全 ${result.matched} 笔的原交易时间；没有重复添加账目。`,
                    );
                    setError('');
                  }
                }}
              >
                按新规则更新已入账分类
              </Button>
              <p className="muted">
                操作前会保留一份账本副本，可在“分类与备份”导出恢复。
              </p>
            </div>
          )}
          <div className="import-stats">
            <div>
              <small>已读取</small>
              <strong>
                {rows.length}
                <i>条</i>
              </strong>
              <small>
                微信 {rows.filter((r) => r.source === 'wechat').length} · 支付宝{' '}
                {rows.filter((r) => r.source === 'alipay').length}
              </small>
            </div>
            <div>
              <small>勾选待导入</small>
              <strong>
                {selection.length}
                <i>笔</i>
              </strong>
              <small>其中 {unclassified.length} 笔尚未分类</small>
            </div>
            <div>
              <small>勾选收入</small>
              <strong className="positive">{money(total('income'))}</strong>
              <small>不是原始账单总额</small>
            </div>
            <div>
              <small>勾选支出</small>
              <strong className="negative">{money(total('expense'))}</strong>
              <small>原消费记支出，退款另记收入</small>
            </div>
          </div>
          <div className="panel">
            <details className="import-explanation">
              <summary>查看自动分类和可疑订单规则</summary>
              <p>
                肯德基、美团、蔬果、饮料、蜜雪冰城等自动归餐饮；低于 30
                元的个人支出转账也归餐饮。其他交易按账单分类和关键词处理，未匹配的自动归其他，不要求逐笔审核。
              </p>
              <p>
                退款到账自动归入收入的“退款”。原消费保留支出，不再改成净支出，也不会将原消费的退款状态重复当作收入。关闭、失败、待支付以及账户充值、还款等不计收支记录自动排除，不列为可疑订单。
              </p>
              <p>
                同日同金额照常记录，只有完整交易时间（年月日时分秒）一致才提示可疑，与金额和来源无关。没有秒数的旧记录不猜测为同一时间。重复选择同一交易会自动跳过，不重复入账。
              </p>
            </details>
            <div className="import-tabs">
              {[
                ['all', '全部记录'],
                ['review', '一键筛选可疑订单'],
                ['selected', '勾选待导入'],
                ['skipped', '暂不导入'],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  variant={tab === id ? 'default' : 'ghost'}
                  onClick={() => {
                    setTab(id);
                    setPage(0);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="import-sources" aria-label="账单来源筛选">
              {(
                [
                  ['all', '全部来源'],
                  ['alipay', '支付宝'],
                  ['wechat', '微信'],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  variant={sourceFilter === id ? 'default' : 'outline'}
                  aria-pressed={sourceFilter === id}
                  onClick={() => {
                    setSourceFilter(id);
                    setPage(0);
                  }}
                >
                  {label}
                </Button>
              ))}
              <span>
                可疑{' '}
                {
                  rows.filter(
                    (r) =>
                      r.possibleDuplicate &&
                      (sourceFilter === 'all' || r.source === sourceFilter),
                  ).length
                }{' '}
                笔 · 自动跳过已存在交易 {rows.filter((r) => r.duplicate).length}{' '}
                笔
              </span>
            </div>
            <div className="import-quick">
              <Button
                variant="outline"
                onClick={() => {
                  setRows((rows) =>
                    rows.map((r) => ({
                      ...r,
                      include:
                        !r.invalid &&
                        !r.duplicate &&
                        !r.possibleDuplicate &&
                        !r.special &&
                        !!r.category,
                    })),
                  );
                  setReviewed(false);
                  setConfirming(false);
                }}
              >
                一键勾选全部正常订单
              </Button>
              <small>
                已自动归类，不需逐笔检查。此按钮作用于全部来源，可疑订单暂不勾选。
              </small>
            </div>
            <div className="import-filters">
              <Input
                aria-label="搜索账单"
                placeholder="搜索商家、商品、分类或活动"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
              />
              <label htmlFor="bill-from">
                从
                <Input
                  id="bill-from"
                  type="date"
                  aria-label="导入起始日期"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label htmlFor="bill-to">
                到
                <Input
                  id="bill-to"
                  type="date"
                  aria-label="导入截止日期"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
            </div>
            <p className="muted">
              来源、搜索和日期只筛选显示，不改变已有勾选。下方资金用途汇总随筛选变化；最终导入仍包含所有来源的勾选记录。
            </p>
            <section className="import-spending">
              <h2>资金用途汇总</h2>
              <p className="muted">
                当前筛选内已勾选 {shown.filter((r) => r.include).length} 笔 ·
                收入 {money(spending.income)}（含退款 {money(spending.refund)}）
                · 支出 {money(spending.expense)} · 净变动{' '}
                {money(spending.balance)}
              </p>
              <div className="import-spending-grid">
                {(['expense', 'income'] as const).map((kind) => (
                  <div key={kind}>
                    <h3>{kind === 'expense' ? '支出用途' : '收入来源'}</h3>
                    {spending.groups
                      .filter((g) => g.kind === kind)
                      .map((g) => (
                        <div className="import-spending-row" key={g.category}>
                          <span>
                            {g.category} <small>{g.count} 笔</small>
                          </span>
                          <strong>{money(g.cents)}</strong>
                          <div className="import-spending-bar">
                            <i
                              style={{
                                width: `${(g.cents / (kind === 'expense' ? spending.expense : spending.income)) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    {!spending.groups.some((g) => g.kind === kind) && (
                      <p className="muted">暂无勾选记录</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <div className="import-bulk">
              <select
                aria-label="批量分类"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">选择分类</option>
                {Array.from(
                  new Set([
                    ...book.categories.expense,
                    ...book.categories.income,
                  ]),
                ).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <Button variant="secondary" onClick={() => bulk('category')}>
                应用分类
              </Button>
              <Input
                aria-label="批量活动标签"
                maxLength={60}
                placeholder="活动标签，例如：西安旅行"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
              />
              <Button variant="secondary" onClick={() => bulk('activity')}>
                应用标签
              </Button>
              <small>
                仅应用到当前筛选中已勾选的{' '}
                {shown.filter((r) => r.include).length} 笔，包含其他页。
              </small>
            </div>
            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>导入</th>
                    <th>交易时间 / 来源</th>
                    <th>商家 / 商品 / 状态</th>
                    <th>方向 / 金额</th>
                    <th>分类 / 活动</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className={
                        r.duplicate || r.invalid
                          ? 'import-disabled'
                          : r.possibleDuplicate
                            ? 'import-caution'
                            : ''
                      }
                    >
                      <td>
                        <Checkbox
                          aria-label={`导入第${r.line}行 ${r.merchant}`}
                          checked={r.include}
                          disabled={r.invalid || r.duplicate || busy}
                          onCheckedChange={(v) =>
                            update(r.id, { include: !!v })
                          }
                        />
                      </td>
                      <td>
                        {r.date || '日期无效'}
                        <small>
                          {r.timestamp
                            ? r.timestamp.slice(11)
                            : r.time || '无时间'}{' '}
                          · {sourceName(r.source)}
                        </small>
                        <small title={r.file}>文件第 {r.line} 行</small>
                      </td>
                      <td>
                        <b>{r.merchant || '未提供商家'}</b>
                        <small className="import-product">
                          {r.description || '无商品说明'}
                        </small>
                        <small>
                          原分类：{r.originalCategory || '无'} · {r.direction} ·{' '}
                          {r.status}
                        </small>
                        <small className="import-reason">{r.reason}</small>
                      </td>
                      <td>
                        <select
                          aria-label={`第${r.line}行收支方向`}
                          value={r.kind}
                          disabled={r.duplicate || r.invalid}
                          onChange={(e) =>
                            update(r.id, {
                              kind: e.target.value as Kind,
                              category: '',
                              remember: false,
                            })
                          }
                        >
                          <option value="expense">支出</option>
                          <option value="income">收入</option>
                        </select>
                        <Input
                          aria-label={`第${r.line}行金额`}
                          inputMode="decimal"
                          value={r.amount}
                          disabled={r.duplicate || r.invalid}
                          onChange={(e) =>
                            update(r.id, { amount: e.target.value })
                          }
                        />
                        <small>原金额 {money(r.cents)}</small>
                      </td>
                      <td>
                        <select
                          aria-label={`第${r.line}行分类`}
                          value={r.category}
                          disabled={r.duplicate || r.invalid}
                          onChange={(e) =>
                            update(r.id, { category: e.target.value })
                          }
                        >
                          <option value="">待分类</option>
                          {book.categories[r.kind].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        <Input
                          aria-label={`第${r.line}行活动`}
                          maxLength={60}
                          placeholder="活动标签（可选）"
                          value={r.activity}
                          disabled={r.duplicate || r.invalid}
                          onChange={(e) =>
                            update(r.id, { activity: e.target.value })
                          }
                        />
                        <label
                          className="import-remember"
                          htmlFor={`remember-${r.id}`}
                        >
                          <Checkbox
                            id={`remember-${r.id}`}
                            checked={r.remember}
                            disabled={
                              !r.merchant ||
                              !r.category ||
                              r.duplicate ||
                              r.invalid
                            }
                            onCheckedChange={(v) =>
                              update(r.id, { remember: !!v })
                            }
                          />
                          记住此商家
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!shown.length && <p className="empty">没有符合条件的记录。</p>}
            </div>
            <div className="import-pagination">
              <span>
                筛选 {shown.length} 条 · 第 {currentPage + 1} / {pageCount} 页
              </span>
              <Button
                variant="outline"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                下一页
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const ids = new Set(
                    shown
                      .filter(
                        (r) =>
                          !r.invalid &&
                          !r.duplicate &&
                          !r.special &&
                          !r.possibleDuplicate,
                      )
                      .map((r) => r.id),
                  );
                  setRows((rows) =>
                    rows.map((r) =>
                      ids.has(r.id) ? { ...r, include: true } : r,
                    ),
                  );
                  setReviewed(false);
                  setConfirming(false);
                }}
              >
                勾选筛选内普通记录
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const ids = new Set(shown.map((r) => r.id));
                  setRows((rows) =>
                    rows.map((r) =>
                      ids.has(r.id) ? { ...r, include: false } : r,
                    ),
                  );
                  setConfirming(false);
                  setReviewed(false);
                }}
              >
                取消勾选筛选结果
              </Button>
            </div>
          </div>
          <div className="panel import-confirm">
            <label className="import-remember" htmlFor="bill-reviewed">
              <Checkbox
                id="bill-reviewed"
                checked={reviewed}
                onCheckedChange={(v) => {
                  setReviewed(!!v);
                  setConfirming(false);
                }}
              />
              使用上述自动分类结果批量入账（无需逐笔审核，可疑订单由我决定是否勾选）
            </label>
            <p className="muted">
              共勾选 {selection.length} 笔。
              {unclassified.length > 0
                ? `请先为其中 ${unclassified.length} 笔选择分类。`
                : '确认后按原交易日期追加，保留原有账目。'}{' '}
              切换收支总览、账单明细或存款计划会保留预览；刷新或关闭网页后需重新选择文件。已保存的账目不受影响。
            </p>
            <div className="flex flex-wrap">
              <Button
                disabled={
                  !reviewed ||
                  !selection.length ||
                  !!unclassified.length ||
                  busy ||
                  disabled ||
                  demo
                }
                onClick={() => {
                  try {
                    buildImportedBook(book, rows, 'preview');
                    setConfirming(true);
                    setError('');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Check />
                检查并准备导入 {selection.length} 笔
              </Button>
              <Button variant="outline" onClick={onBackup}>
                导出当前账本备份
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRows((rows) =>
                    rows.map((r) => ({ ...r, include: false })),
                  );
                  setReviewed(false);
                  setConfirming(false);
                }}
              >
                取消全部勾选
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (confirm('清空本次预览？已保存的账本不受影响。')) {
                    setRows([]);
                    setReviewed(false);
                    setConfirming(false);
                    setFileErrors([]);
                  }
                }}
              >
                清空预览
              </Button>
            </div>
            {confirming && (
              <div className="import-final" role="alert">
                <b>
                  即将追加 {selection.length} 笔：收入 {money(total('income'))}
                  ，支出 {money(total('expense'))}。
                </b>
                <p>
                  其中 {selection.filter((r) => r.possibleDuplicate).length}{' '}
                  笔交易时间完全相同的可疑订单已由你勾选。其他订单按自动分类记录。
                </p>
                <Button onClick={finish}>确认保存到账本</Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  继续检查
                </Button>
              </div>
            )}
          </div>
        </>
      )}
      {lastBatch && (
        <div className="panel">
          <h2>最近一次导入</h2>
          <p className="muted">
            {lastBatch.slice(0, 10)} · 仍在账本中 {lastCount}{' '}
            笔。撤销只删除该批次记录，不影响其他账目；该批次后来修改过的记录也会删除。商家规则保留，可在分类与备份中清除。
          </p>
          <Button
            variant="outline"
            disabled={disabled || busy}
            onClick={() => {
              if (
                !confirm(
                  `撤销最近导入的 ${lastCount} 笔？包含该批次之后手动修改的账目。`,
                )
              )
                return;
              const next = {
                ...book,
                entries: book.entries.filter(
                  (e) => e.importInfo?.batch !== lastBatch,
                ),
              };
              if (onCommit(next)) {
                setRows([]);
                setConfirming(false);
                setReviewed(false);
                setSuccess(
                  '已撤销最近一批导入，其他账目保持不变。重新选择原文件即可再次预览。',
                );
              }
            }}
          >
            <RotateCcw />
            撤销最近一批导入
          </Button>
        </div>
      )}
    </section>
  );
}

'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { InstallmentCalculator } from '@/components/installment-calculator';
import { Bell, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  type Book,
  type Goal,
  money,
  monthsLeft,
  remaining,
  today,
  toggleInstallment,
} from '@/lib/ledger';

type SavingsActions = {
  book: Book;
  onCommit: (next: Book) => boolean;
  onError: (message: string) => void;
  onNewGoal: () => void;
  onEditGoal: (goal: Goal) => void;
  onDeposit: (goal: Goal) => void;
};

export function GoalCard({
  goal: g,
  compact = false,
  book,
  onCommit,
  onError,
  onEditGoal,
  onDeposit,
}: Pick<SavingsActions, 'book' | 'onCommit' | 'onError' | 'onEditGoal' | 'onDeposit'> & {
  goal: Goal;
  compact?: boolean;
}) {
  const left = remaining(g);
  const months = monthsLeft(g);
  const updateGoal = (goal: Goal) =>
    onCommit({
      ...book,
      goals: book.goals.map((x) => (x.id === g.id ? goal : x)),
    });

  return (
    <article className="goal">
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
        <b>{money(g.saved)}</b> <span className="muted">/ {money(g.target)}</span>
      </p>
      <Progress
        aria-label={`${g.name}完成进度`}
        value={Math.min(100, Math.round((g.saved / g.target) * 100))}
        className="my-4"
      />
      <div className="goal-head">
        <small>还差 {money(left)}</small>
        <small>{Math.min(100, Math.round((g.saved / g.target) * 100))}%</small>
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
          <label className="goal-complete-toggle" htmlFor={`goal-complete-${g.id}`}>
            <Checkbox
              id={`goal-complete-${g.id}`}
              checked={g.completed ?? left === 0}
              onCheckedChange={(checked) =>
                updateGoal({ ...g, completed: checked })
              }
            />
            手动标记整个计划已完成
          </label>
          <p className="muted">取消勾选可重新开启计划；此开关不改变已存金额。</p>
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
                          updateGoal(toggleInstallment(g, p.id, checked));
                        } catch (e) {
                          onError((e as Error).message);
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
            <Button variant="secondary" onClick={() => onDeposit(g)}>
              <Plus />存入 / 取出
            </Button>
            <Button
              variant="ghost"
              onClick={() => onEditGoal(g)}
              aria-label={`编辑${g.name}`}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              aria-label={`删除${g.name}`}
              onClick={() => {
                if (confirm(`删除“${g.name}”？不会修改收支账目。`))
                  onCommit({
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

export function SavingsPage({
  book,
  onCommit,
  onError,
  onNewGoal,
  onEditGoal,
  onDeposit,
  showCalculator,
  onToggleCalculator,
}: SavingsActions & {
  showCalculator: boolean;
  onToggleCalculator: () => void;
}) {
  const unfinished = book.goals.filter(
    (g) => !(g.completed ?? remaining(g) === 0),
  );
  const savedTotal = book.goals.reduce((sum, goal) => sum + goal.saved, 0);
  const cardActions = { book, onCommit, onError, onEditGoal, onDeposit };

  return (
    <>
      <div className="toolbar">
        <h1>存款计划</h1>
        <Button onClick={onNewGoal}><Plus />新建计划</Button>
      </div>
      <h2>正在存款的项目</h2>
      <div className="backup-grid">
        {unfinished.map((goal) => (
          <section className="panel" key={goal.id}>
            <GoalCard goal={goal} {...cardActions} />
          </section>
        ))}
      </div>
      {!unfinished.length && (
        <div className="panel empty">
          目前没有进行中的存款计划。
          <Button variant="link" onClick={onNewGoal}>创建第一个目标</Button>
        </div>
      )}
      {book.goals.length > unfinished.length && (
        <details className="panel">
          <summary>已完成的计划（{book.goals.length - unfinished.length}）</summary>
          <div className="backup-grid">
            {book.goals
              .filter((goal) => !unfinished.some((item) => item.id === goal.id))
              .map((goal) => (
                <section key={goal.id}>
                  <GoalCard goal={goal} {...cardActions} />
                </section>
              ))}
          </div>
        </details>
      )}
      <div className="notice">
        <Bell size={17} />
        <span>
          {unfinished.length
            ? `你有 ${unfinished.length} 个目标待完成，还需存入 ${money(unfinished.reduce((sum, goal) => sum + remaining(goal), 0))}。`
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
          <strong>{unfinished.length} <small style={{ display: 'inline' }}>个</small></strong>
          <small>每月建议按含本月的剩余自然月均摊</small>
        </article>
        <article className="stat">
          <p>已经完成</p>
          <strong>{book.goals.length - unfinished.length} <small style={{ display: 'inline' }}>个</small></strong>
          <small>让期待，一件件发生</small>
        </article>
      </section>
      <p className="muted">
        分期完成状态会随备份保存。普通存入/取出暂不保留逐笔历史；请勿把同一笔存款分配给多个目标。
      </p>
      <div className="calculator-entry">
        <div>
          <h2>把一个目标，拆成每月的小计划</h2>
          <p className="muted">填入旅行、购物或备用金预算，比较几种分期存款安排。</p>
        </div>
        <Button variant="secondary" onClick={onToggleCalculator}>
          {showCalculator ? '收起计算器' : '打开分期存款计算器'}
        </Button>
      </div>
      {showCalculator && (
        <InstallmentCalculator
          onCreate={(goal) => {
            const ok = onCommit({ ...book, goals: [...book.goals, goal] });
            if (ok) onToggleCalculator();
            return ok;
          }}
        />
      )}
    </>
  );
}

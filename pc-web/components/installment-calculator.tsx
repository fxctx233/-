'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type Goal,
  type Installment,
  cents,
  money,
  today,
  makeInstallments,
} from '@/lib/ledger';

export function InstallmentCalculator({
  onCreate,
  draft,
  onDraftChange,
}: {
  onCreate: (goal: Goal) => boolean;
  draft?: { name: string; target: string; saved: string };
  onDraftChange?: (draft: {
    name: string;
    target: string;
    saved: string;
  }) => void;
}) {
  const [localDraft, setLocalDraft] = useState({
    name: '旅行基金',
    target: '5000',
    saved: '0',
  });
  const { name, target, saved } = draft ?? localDraft;
  function change(field: 'name' | 'target' | 'saved', value: string) {
    const next = { ...(draft ?? localDraft), [field]: value };
    if (draft && onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
  }
  const [monthly, setMonthly] = useState('1000'),
    [months, setMonths] = useState('2'),
    [start, setStart] = useState(today()),
    [error, setError] = useState('');
  let total = 0,
    already = 0,
    inputError = '';
  try {
    total = cents(target);
    already = cents(saved);
    if (total <= already) throw new Error('目标金额需要大于当前已存金额。');
  } catch (e) {
    inputError = (e as Error).message;
  }
  const choices = [
    { title: '按每月预算', mode: 'monthly' as const, value: monthly },
    { title: '按完成时间', mode: 'months' as const, value: months },
    { title: '慢慢存 · 6 个月', mode: 'months' as const, value: '6' },
  ];
  return (
    <section className="panel calculator">
      <div className="toolbar">
        <h2>分期存款计算器</h2>
        <span className="badge">只做计划，不自动扣款</span>
      </div>
      <p className="muted">
        比如旅行预算 5,000 元：每月存 1,000 元，5 个月完成；或用 2 个月，每月存
        2,500 元。
      </p>
      <div className="form-grid">
        <label>
          计划名称
          <Input
            value={name}
            maxLength={60}
            onChange={(e) => change('name', e.target.value)}
          />
        </label>
        <label>
          目标总金额（元）
          <Input
            value={target}
            inputMode="decimal"
            onChange={(e) => change('target', e.target.value)}
          />
        </label>
        <label>
          当前已存（元）
          <Input
            value={saved}
            inputMode="decimal"
            onChange={(e) => change('saved', e.target.value)}
          />
        </label>
        <label>
          第一期存款日期
          <Input
            type="date"
            value={start}
            min="1900-01-01"
            max="9999-12-31"
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          每月能存多少（元）
          <Input
            value={monthly}
            inputMode="decimal"
            onChange={(e) => setMonthly(e.target.value)}
          />
        </label>
        <label>
          希望几个月完成
          <Input
            type="number"
            min="1"
            max="120"
            step="1"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        按每月一期计算，从第一期日期起连续安排。月底日期自动适配短月份；金额精确到分，不计算利息。
      </p>
      {(error || inputError) && (
        <p className="error" role="alert">
          {error || inputError}
        </p>
      )}
      {!inputError && (
        <div className="plan-options">
          {choices.map((choice) => {
            let schedule: Installment[] = [],
              problem = '';
            try {
              const value =
                choice.mode === 'monthly'
                  ? cents(choice.value)
                  : Number(choice.value);
              schedule = makeInstallments(
                total - already,
                start,
                choice.mode,
                value,
              );
            } catch (e) {
              problem = (e as Error).message;
            }
            return (
              <article className="plan-option" key={choice.title}>
                <h3>{choice.title}</h3>
                {problem ? (
                  <p className="muted">{problem}</p>
                ) : (
                  <>
                    <strong>
                      {money(schedule[0].cents)}
                      <small> / 期</small>
                    </strong>
                    <p>
                      {schedule.length} 个月 · 共需再存 {money(total - already)}
                    </p>
                    <p className="muted">
                      最后一期 {money(schedule.at(-1)!.cents)}
                      <br />
                      {schedule.at(-1)!.date} 完成
                    </p>
                    <details>
                      <summary>查看逐期安排</summary>
                      <ol>
                        {schedule.map((p, i) => (
                          <li key={p.id}>
                            第 {i + 1} 期 · {p.date} · {money(p.cents)}
                          </li>
                        ))}
                      </ol>
                    </details>
                    <Button
                      className="mt-4"
                      onClick={() => {
                        if (!name.trim()) {
                          setError('请填写计划名称。');
                          return;
                        }
                        setError('');
                        onCreate({
                          id: crypto.randomUUID(),
                          name: name.trim(),
                          target: total,
                          saved: already,
                          deadline: schedule.at(-1)!.date,
                          installments: schedule,
                          completed: false,
                        });
                      }}
                    >
                      采用这个计划
                    </Button>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      <p className="muted">
        采用后会新建计划；实际存好一笔再勾选该期，会增加已存金额。取消勾选会减回同样金额，不影响收支账目。
      </p>
    </section>
  );
}

'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cents, money, type Book, type ShoppingPlan } from '@/lib/ledger';

export function ShoppingPlans({
  book,
  disabled,
  onCommit,
}: {
  book: Book;
  disabled: boolean;
  onCommit: (book: Book) => boolean;
}) {
  const plans = book.shoppingPlans ?? [];
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [remove, setRemove] = useState('');
  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  function save(next: ShoppingPlan[]) {
    if (disabled) return false;
    const ok = onCommit({ ...book, shoppingPlans: next });
    if (ok) setError('');
    return ok;
  }
  function patch(next: ShoppingPlan) {
    return save(plans.map((p) => (p.id === next.id ? next : p)));
  }
  function submitItem(form: HTMLFormElement, id?: string) {
    if (!plan) return;
    try {
      const data = new FormData(form);
      const name = String(data.get('itemName') ?? '').trim();
      if (!name) throw new Error('请输入物品名称。');
      const item = {
        id: id ?? crypto.randomUUID(),
        name,
        cents: cents(String(data.get('amount'))),
      };
      if (
        patch({
          ...plan,
          items: id
            ? plan.items.map((i) => (i.id === id ? item : i))
            : [...plan.items, item],
        }) &&
        !id
      )
        form.reset();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="shopping-plans">
      <div className="panel">
        <h2>新建购物计划</h2>
        <p className="muted">
          例如旅行装备、家居采购、生日礼物。这里只计算预算，不扣余额、不生成账目。
        </p>
        <form
          className="shopping-create"
          onSubmit={(e) => {
            e.preventDefault();
            const f = e.currentTarget;
            const name = String(new FormData(f).get('planName') ?? '').trim();
            if (!name) {
              setError('请输入计划名称。');
              return;
            }
            const id = crypto.randomUUID();
            if (save([...plans, { id, name, items: [] }])) {
              setSelected(id);
              f.reset();
              setRemove('');
            }
          }}
        >
          <Input
            name="planName"
            aria-label="新购物计划名称"
            placeholder="给购物计划起个名字"
            maxLength={60}
            required
            disabled={disabled}
          />
          <Button disabled={disabled || plans.length >= 200}>
            新建购物计划
          </Button>
        </form>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="shopping-tabs" aria-label="选择购物计划">
        {plans.map((p) => (
          <Button
            key={p.id}
            variant={p.id === plan?.id ? 'secondary' : 'outline'}
            aria-pressed={p.id === plan?.id}
            onClick={() => {
              setSelected(p.id);
              setRemove('');
              setError('');
            }}
          >
            {p.name} · {money(p.items.reduce((s, i) => s + i.cents, 0))}
          </Button>
        ))}
      </div>
      {!plan ? (
        <div className="panel empty">
          还没有购物计划，先在上方创建一个清单。
        </div>
      ) : (
        <section className="panel" key={plan.id}>
          <div className="shopping-total">
            <div>
              <h2>{plan.name}</h2>
              <p className="muted">{plan.items.length} 件物品 · 预计合计</p>
            </div>
            <strong>
              {money(plan.items.reduce((s, i) => s + i.cents, 0))}
            </strong>
          </div>
          <details className="shopping-manage">
            <summary>重命名 / 删除计划</summary>
            <form
              className="shopping-create"
              onSubmit={(e) => {
                e.preventDefault();
                const name = String(
                  new FormData(e.currentTarget).get('name') ?? '',
                ).trim();
                if (!name) {
                  setError('名称不能为空。');
                  return;
                }
                patch({ ...plan, name });
              }}
            >
              <Input
                key={plan.name}
                name="name"
                aria-label="修改购物计划名称"
                defaultValue={plan.name}
                maxLength={60}
                required
                disabled={disabled}
              />
              <Button disabled={disabled}>保存名称</Button>
            </form>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => setRemove(plan.id)}
            >
              删除此计划
            </Button>
            {remove === plan.id && (
              <div className="notice" role="alert">
                删除“{plan.name}”及其中全部物品？
                <div className="flex flex-wrap">
                  <Button
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => {
                      if (save(plans.filter((p) => p.id !== plan.id)))
                        setRemove('');
                    }}
                  >
                    确认删除计划
                  </Button>
                  <Button variant="outline" onClick={() => setRemove('')}>
                    取消
                  </Button>
                </div>
              </div>
            )}
          </details>
          <h3>物品清单</h3>
          {plan.items.map((item) => (
            <form
              className="shopping-item"
              key={item.id + ':' + item.name + ':' + item.cents}
              onSubmit={(e) => {
                e.preventDefault();
                submitItem(e.currentTarget, item.id);
              }}
            >
              <label>
                物品
                <Input
                  name="itemName"
                  aria-label={`物品名称 ${item.name}`}
                  defaultValue={item.name}
                  maxLength={100}
                  required
                  disabled={disabled}
                />
              </label>
              <label>
                金额（元）
                <Input
                  name="amount"
                  aria-label={`物品金额 ${item.name}`}
                  inputMode="decimal"
                  defaultValue={(item.cents / 100).toFixed(2)}
                  required
                  disabled={disabled}
                />
              </label>
              <Button variant="outline" disabled={disabled}>
                保存修改
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => setRemove(item.id)}
              >
                删除
              </Button>
              {remove === item.id && (
                <div className="shopping-item-confirm">
                  删除“{item.name}”？
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        patch({
                          ...plan,
                          items: plan.items.filter((i) => i.id !== item.id),
                        })
                      )
                        setRemove('');
                    }}
                  >
                    确认删除物品
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRemove('')}
                  >
                    取消
                  </Button>
                </div>
              )}
            </form>
          ))}
          <form
            className="shopping-item shopping-add"
            onSubmit={(e) => {
              e.preventDefault();
              submitItem(e.currentTarget);
            }}
          >
            <label>
              新增物品
              <Input
                name="itemName"
                aria-label="新增物品名称"
                placeholder="例如：行李箱"
                maxLength={100}
                required
                disabled={disabled}
              />
            </label>
            <label>
              预计金额（元）
              <Input
                name="amount"
                aria-label="新增物品金额"
                inputMode="decimal"
                placeholder="0.00"
                required
                disabled={disabled}
              />
            </label>
            <Button disabled={disabled || plan.items.length >= 1000}>
              添加物品
            </Button>
          </form>
          <p className="muted">
            修改物品后点“保存修改”更新合计。多个计划分别保存，随完整 JSON
            备份一起导出。
          </p>
        </section>
      )}
    </section>
  );
}

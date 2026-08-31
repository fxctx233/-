import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cents,
  emptyBook,
  validateBook,
  validDate,
  periodEntries,
  totals,
  remaining,
  monthsLeft,
  demoBook,
  makeInstallments,
  toggleInstallment,
  entryMoment,
  bulkUpdateEntries,
  filterEntryRanges,
  emptyEntryRanges,
  sortEntries,
  type Entry,
  adjustCurrentFunds,
  applyFundsChange,
  currentFunds,
} from './ledger.ts';

void test('manual current funds can be set, added and subtracted, persist in backups, and never change entries or goals', () => {
  const original = demoBook();
  assert.equal(validateBook(original).currentFunds, undefined);
  const set = adjustCurrentFunds(original, 'set', 100000);
  const added = adjustCurrentFunds(set, 'add', 2500);
  const reduced = adjustCurrentFunds(added, 'subtract', 12500);
  assert.equal(set.currentFunds, 100000);
  assert.equal(added.currentFunds, 102500);
  assert.equal(reduced.currentFunds, 90000);
  assert.deepEqual(reduced.entries, original.entries);
  assert.deepEqual(reduced.goals, original.goals);
  assert.equal(original.currentFunds, undefined);
  assert.equal(
    validateBook(JSON.parse(JSON.stringify(reduced))).currentFunds,
    90000,
  );
  assert.equal(
    bulkUpdateEntries(reduced, [reduced.entries[0].id], { type: 'delete' })
      .currentFunds,
    90000,
  );
  assert.equal(adjustCurrentFunds(reduced, 'set', 0).currentFunds, 0);
  assert.equal(adjustCurrentFunds(reduced, 'subtract', 90001).currentFunds, -1);
  assert.throws(() => adjustCurrentFunds(reduced, 'add', 0));
  assert.equal(adjustCurrentFunds(reduced, 'set', -1).currentFunds, -1);
  assert.throws(() => adjustCurrentFunds(reduced, 'set', 0.1));
  assert.throws(() =>
    adjustCurrentFunds({ ...reduced, currentFunds: 99999999999 }, 'add', 1),
  );
  for (const value of [0.1, '100', null, 100000000000, -100000000000, NaN])
    assert.throws(() => validateBook({ ...original, currentFunds: value }));
});
void test('funds follow entry deltas for spending, income, edits, deletes and batch reversal without recharging history', () => {
  const original = { ...demoBook(), currentFunds: 100000 };
  const expense: Entry = {
    id: 'new-expense',
    kind: 'expense',
    category: '餐饮',
    date: '2026-08-01',
    cents: 1000,
    note: '',
  };
  const income: Entry = {
    ...expense,
    id: 'new-income',
    kind: 'income',
    category: '退款',
    cents: 2000,
  };
  const spend = applyFundsChange(original, {
    ...original,
    entries: [...original.entries, expense],
  });
  assert.equal(spend.currentFunds, 99000);
  const earn = applyFundsChange(spend, {
    ...spend,
    entries: [...spend.entries, income],
  });
  assert.equal(earn.currentFunds, 101000);
  const edit = applyFundsChange(earn, {
    ...earn,
    entries: earn.entries.map((e) =>
      e.id === expense.id ? { ...e, cents: 1500 } : e,
    ),
  });
  assert.equal(edit.currentFunds, 100500);
  const flip = applyFundsChange(edit, {
    ...edit,
    entries: edit.entries.map((e) =>
      e.id === income.id ? { ...e, kind: 'expense', category: '其他' } : e,
    ),
  });
  assert.equal(flip.currentFunds, 96500);
  const classify = applyFundsChange(
    flip,
    bulkUpdateEntries(flip, [expense.id], {
      type: 'category',
      category: '购物',
    }),
  );
  assert.equal(classify.currentFunds, 96500);
  const deleted = applyFundsChange(
    classify,
    bulkUpdateEntries(classify, [expense.id], { type: 'delete' }),
  );
  assert.equal(deleted.currentFunds, 98000);
  const undoBatch = applyFundsChange(deleted, {
    ...deleted,
    entries: original.entries,
  });
  assert.equal(undoBatch.currentFunds, 100000);
  const calibrated = applyFundsChange(
    undoBatch,
    adjustCurrentFunds(undoBatch, 'set', 80000),
  );
  assert.equal(calibrated.currentFunds, 80000);
  assert.equal(
    applyFundsChange(calibrated, { ...calibrated }).currentFunds,
    80000,
  );
  const restored = validateBook(JSON.parse(JSON.stringify(edit)));
  assert.equal(restored.currentFunds, 100500);
  assert.equal(
    applyFundsChange(restored, { ...restored }).currentFunds,
    100500,
  );
  assert.equal(original.currentFunds, 100000);
});
void test('uninitialized and insufficient balances permit real spending and signed balances survive backup', () => {
  const previous = emptyBook();
  const entry: Entry = {
    id: 'spend',
    date: '2026-08-01',
    kind: 'expense',
    category: '其他',
    cents: 2550,
    note: '',
  };
  const spent = applyFundsChange(previous, { ...previous, entries: [entry] });
  assert.equal(currentFunds(spent), -2550);
  assert.equal(
    validateBook(JSON.parse(JSON.stringify(spent))).currentFunds,
    -2550,
  );
  const legacy = { ...previous, entries: [entry] };
  assert.equal(currentFunds(legacy), -2550);
  assert.equal(applyFundsChange(legacy, { ...legacy }).currentFunds, -2550);
  assert.equal(
    applyFundsChange(spent, { ...spent, entries: [] }).currentFunds,
    0,
  );
  assert.throws(() =>
    applyFundsChange(
      { ...previous, currentFunds: -99999999999 },
      { ...previous, currentFunds: -99999999999, entries: [entry] },
    ),
  );
});
void test('sorting supports date, time of day, numeric amount and directions without mutating the book', () => {
  const base = { kind: 'expense' as const, category: '其他', note: '' };
  const entries: Entry[] = [
    { ...base, id: 'late-date', date: '2026-08-03', time: '08:00', cents: 900 },
    {
      ...base,
      id: 'late-clock',
      date: '2026-08-01',
      time: '18:00',
      cents: 10000,
    },
    { ...base, id: 'unknown', date: '2026-08-02', cents: 100 },
  ];
  const ids = (es: Entry[]) => es.map((e) => e.id);
  assert.deepEqual(ids(sortEntries(entries, 'date', 'asc')), [
    'late-clock',
    'unknown',
    'late-date',
  ]);
  assert.deepEqual(ids(sortEntries(entries, 'date', 'desc')), [
    'late-date',
    'unknown',
    'late-clock',
  ]);
  assert.deepEqual(ids(sortEntries(entries, 'time', 'asc')), [
    'late-date',
    'late-clock',
    'unknown',
  ]);
  assert.deepEqual(ids(sortEntries(entries, 'time', 'desc')), [
    'late-clock',
    'late-date',
    'unknown',
  ]);
  assert.deepEqual(ids(sortEntries(entries, 'amount', 'asc')), [
    'unknown',
    'late-date',
    'late-clock',
  ]);
  assert.deepEqual(ids(sortEntries(entries, 'amount', 'desc')), [
    'late-clock',
    'late-date',
    'unknown',
  ]);
  assert.deepEqual(ids(entries), ['late-date', 'late-clock', 'unknown']);
  const precise: Entry[] = [
    {
      ...base,
      id: 'later-second',
      date: '2026-08-01',
      time: '10:24',
      cents: 100,
      importInfo: {
        source: 'wechat',
        key: 'a'.repeat(64),
        batch: 'b',
        merchant: '测试',
        timestamp: '2026-08-01 10:24:59',
      },
    },
    {
      ...base,
      id: 'earlier-second',
      date: '2026-08-01',
      time: '10:24',
      cents: 100,
      importInfo: {
        source: 'wechat',
        key: 'b'.repeat(64),
        batch: 'b',
        merchant: '测试',
        timestamp: '2026-08-01 10:24:01',
      },
    },
  ];
  assert.deepEqual(ids(sortEntries(precise, 'time', 'asc')), [
    'earlier-second',
    'later-second',
  ]);
  assert.deepEqual(ids(sortEntries(precise, 'date', 'desc')), [
    'later-second',
    'earlier-second',
  ]);
  precise[0].time = '09:00';
  assert.deepEqual(ids(sortEntries(precise, 'time', 'asc')), [
    'later-second',
    'earlier-second',
  ]);
});
void test('date, daily time and amount ranges combine inclusively without guessing missing times', () => {
  const entries = [
    {
      id: 'a',
      date: '2025-12-31',
      time: '10:24',
      kind: 'expense' as const,
      category: '餐饮',
      cents: 1000,
      note: '',
    },
    {
      id: 'b',
      date: '2026-01-01',
      time: '12:00',
      kind: 'income' as const,
      category: '其他',
      cents: 2000,
      note: '',
    },
    {
      id: 'c',
      date: '2026-01-01',
      kind: 'expense' as const,
      category: '其他',
      cents: 1000,
      note: '',
    },
    {
      id: 'd',
      date: '2026-01-02',
      time: '12:01',
      kind: 'expense' as const,
      category: '餐饮',
      cents: 2001,
      note: '',
    },
  ];
  const ranges = {
    ...emptyEntryRanges(),
    dateFrom: '2025-12-31',
    dateTo: '2026-01-01',
    timeFrom: '10:24',
    timeTo: '12:00',
    amountMin: '10',
    amountMax: '20.00',
  };
  assert.deepEqual(
    filterEntryRanges(entries, ranges).map((e) => e.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    filterEntryRanges(entries, {
      ...emptyEntryRanges(),
      amountMin: '10.00',
      amountMax: '10',
    }).map((e) => e.id),
    ['a', 'c'],
  );
  assert.deepEqual(
    filterEntryRanges(entries, {
      ...emptyEntryRanges(),
      dateFrom: '2026-01-02',
    }).map((e) => e.id),
    ['d'],
  );
  assert.deepEqual(
    filterEntryRanges(entries, { ...emptyEntryRanges(), timeTo: '10:24' }).map(
      (e) => e.id,
    ),
    ['a'],
  );
  assert.deepEqual(
    filterEntryRanges(entries, { ...emptyEntryRanges(), amountMax: '0' }),
    [],
  );
  assert.deepEqual(filterEntryRanges(entries, emptyEntryRanges()), entries);
  for (const invalid of [
    { dateFrom: '2026-02-30' },
    { dateFrom: '2026-02-01', dateTo: '2026-01-01' },
    { timeFrom: '24:00' },
    { timeFrom: '22:00', timeTo: '02:00' },
    { amountMin: '-1' },
    { amountMax: '1.001' },
    { amountMin: '30', amountMax: '20' },
    { amountMin: 'abc' },
  ])
    assert.throws(() =>
      filterEntryRanges(entries, { ...emptyEntryRanges(), ...invalid }),
    );
});
void test('bulk changes affect only selected entries and preserve amounts, time, metadata, goals and rules', () => {
  const book = emptyBook();
  book.entries = [
    {
      id: 'expense-a',
      kind: 'expense',
      category: '其他',
      date: '2026-08-01',
      time: '10:24',
      cents: 1500,
      note: '午饭',
      activity: '旅行',
      importInfo: {
        source: 'wechat',
        key: 'a'.repeat(64),
        batch: 'test',
        merchant: '测试商家',
        timestamp: '2026-08-01 10:24:36',
      },
    },
    {
      id: 'expense-b',
      kind: 'expense',
      category: '其他',
      date: '2026-08-02',
      cents: 2200,
      note: '保留',
    },
    {
      id: 'income',
      kind: 'income',
      category: '其他',
      date: '2026-08-01',
      cents: 20000,
      note: '收入',
    },
  ];
  book.goals = [
    {
      id: 'g',
      name: '旅行',
      target: 500000,
      saved: 100000,
      deadline: '2027-08-01',
    },
  ];
  book.merchantRules = [
    {
      source: 'wechat',
      merchant: '测试商家',
      kind: 'expense',
      category: '其他',
    },
  ];
  const changed = bulkUpdateEntries(book, ['expense-a'], {
    type: 'category',
    category: '餐饮',
  });
  assert.deepEqual(changed.entries[0], {
    ...book.entries[0],
    category: '餐饮',
  });
  assert.deepEqual(changed.entries.slice(1), book.entries.slice(1));
  assert.deepEqual(totals(changed.entries), totals(book.entries));
  assert.equal(book.entries[0].category, '其他');
  assert.throws(() =>
    bulkUpdateEntries(book, ['expense-a', 'income'], {
      type: 'category',
      category: '餐饮',
    }),
  );
  assert.throws(() => bulkUpdateEntries(book, ['missing'], { type: 'delete' }));
  assert.throws(() => bulkUpdateEntries(book, [], { type: 'delete' }));
  const deleted = bulkUpdateEntries(changed, ['expense-a', 'expense-b'], {
    type: 'delete',
  });
  assert.deepEqual(deleted.entries, [book.entries[2]]);
  assert.deepEqual(deleted.goals, book.goals);
  assert.deepEqual(deleted.categories, book.categories);
  assert.deepEqual(deleted.merchantRules, book.merchantRules);
});
void test('old backups gain new expense categories without changing entries or duplicating categories', () => {
  const old = emptyBook();
  old.categories.expense = ['餐饮', '其他', '自定义'];
  old.entries = [
    {
      id: 'legacy',
      date: '2026-08-01',
      kind: 'expense',
      category: '自定义',
      cents: 100,
      note: '保留',
    },
  ];
  const migrated = validateBook(old);
  assert.deepEqual(migrated.categories.expense, [
    '餐饮',
    '其他',
    '自定义',
    '转账',
    '工作需求',
    '综合购物',
  ]);
  assert.deepEqual(migrated.entries, old.entries);
  assert.deepEqual(old.categories.expense, ['餐饮', '其他', '自定义']);
  assert.deepEqual(validateBook(migrated), migrated);
  old.entries = [];
  old.categories.expense = Array.from({ length: 200 }, (_, i) => `分类${i}`);
  const full = validateBook(old);
  assert.equal(full.categories.expense.length, 203);
  assert.deepEqual(validateBook(full), full);
});
test('historical entries retain selected date, optional time, and aggregate correctly', () => {
  const now = new Date(2026, 7, 31, 10, 24);
  assert.deepEqual(entryMoment(null, null, '', now), {
    date: '2026-08-31',
    time: '10:24',
  });
  assert.deepEqual(entryMoment(null, '2025-12-31', '', now), {
    date: '2025-12-31',
  });
  const b = emptyBook();
  b.entries = [
    {
      id: 'past',
      kind: 'expense',
      category: '餐饮',
      cents: 2000,
      note: '补记',
      ...entryMoment(null, '2025-12-31', '18:30', now),
    },
  ];
  assert.equal(totals(periodEntries(b, 'year', '2025-01-01')).expense, 2000);
  assert.equal(totals(periodEntries(b, 'month', '2026-08-01')).expense, 0);
  assert.deepEqual(entryMoment(b.entries[0], null, '', now), {
    date: '2025-12-31',
    time: '18:30',
  });
  assert.throws(() => entryMoment(null, '2026-09-01', '', now));
  assert.throws(() => entryMoment(null, '2026-02-30', '', now));
});
test('installment plans conserve cents and handle month-end and cross-year dates', () => {
  const monthly = makeInstallments(500000, '2026-08-31', 'monthly', 100000);
  assert.equal(monthly.length, 5);
  assert.equal(monthly[1].date, '2026-09-30');
  assert.equal(monthly[2].date, '2026-10-31');
  assert.equal(
    monthly.reduce((s, p) => s + p.cents, 0),
    500000,
  );
  const two = makeInstallments(500000, '2026-12-31', 'months', 2);
  assert.deepEqual(
    two.map((p) => p.cents),
    [250000, 250000],
  );
  assert.equal(two[1].date, '2027-01-31');
  const odd = makeInstallments(500000, '2024-01-31', 'months', 3);
  assert.equal(odd[1].date, '2024-02-29');
  assert.equal(
    odd.reduce((s, p) => s + p.cents, 0),
    500000,
  );
  assert.deepEqual(
    makeInstallments(250, '2026-01-01', 'monthly', 100).map((p) => p.cents),
    [100, 100, 50],
  );
  for (const n of [0, -1, 1.5, 121])
    assert.throws(() => makeInstallments(500000, '2026-01-01', 'months', n));
});
test('checking installments is reversible, idempotent, and preserved by backup', () => {
  const b = emptyBook();
  const g = {
    id: 'trip',
    name: '旅行',
    target: 500000,
    saved: 100000,
    deadline: '2026-12-31',
    installments: makeInstallments(400000, '2026-08-31', 'months', 2),
  };
  const done = toggleInstallment(g, 'period-1', true);
  assert.equal(done.saved, 300000);
  assert.equal(toggleInstallment(done, 'period-1', true).saved, 300000);
  const undone = toggleInstallment(
    { ...done, completed: true },
    'period-1',
    false,
  );
  assert.equal(undone.saved, 100000);
  assert.equal(undone.completed, false);
  b.goals = [{ ...done, completed: true }];
  assert.deepEqual(validateBook(JSON.parse(JSON.stringify(b))), b);
  const invalid = structuredClone(b);
  invalid.goals[0].saved = 0;
  assert.throws(() => validateBook(invalid));
  const duplicate = structuredClone(b);
  duplicate.goals[0].installments!.push({
    ...duplicate.goals[0].installments![0],
  });
  assert.throws(() => validateBook(duplicate));
});
test('money uses integer cents and rejects invalid or excessive precision', () => {
  assert.equal(cents('0.10') + cents('0.20'), 30);
  assert.equal(cents('1234.56'), 123456);
  for (const x of ['-1', 'NaN', '1.001', '1e4', '1000000000'])
    assert.throws(() => cents(x));
});
test('statistics respect calendar boundaries and edited amounts', () => {
  const b = emptyBook();
  b.entries = [
    {
      id: 'a',
      date: '2025-12-31',
      kind: 'income',
      category: '工资',
      cents: 10000,
      note: '',
    },
    {
      id: 'b',
      date: '2026-01-01',
      kind: 'expense',
      category: '餐饮',
      cents: 1234,
      note: '',
    },
    {
      id: 'c',
      date: '2026-01-02',
      kind: 'income',
      category: '工资',
      cents: 20000,
      note: '',
    },
  ];
  assert.equal(totals(periodEntries(b, 'year', '2025-01-01')).income, 10000);
  assert.deepEqual(totals(periodEntries(b, 'month', '2026-01-15')), {
    income: 20000,
    expense: 1234,
    balance: 18766,
  });
  assert.equal(periodEntries(b, 'day', '2026-01-01').length, 1);
  b.entries[1].cents = 333;
  assert.equal(totals(periodEntries(b, 'month', '2026-01-01')).balance, 19667);
});
test('backup roundtrip preserves book and rejects corrupt data', () => {
  const b = demoBook();
  assert.deepEqual(validateBook(JSON.parse(JSON.stringify(b))), b);
  for (const mutate of [
    (x: any) => (x.version = 2),
    (x: any) => x.entries.push({ ...x.entries[0] }),
    (x: any) => (x.entries[0].cents = 0.1),
    (x: any) => (x.entries[0].category = 'missing'),
    (x: any) => (x.entries[0].date = '2026-02-30'),
    (x: any) => (x.goals[0].saved = -1),
    (x: any) => (x.categories.income = []),
  ]) {
    const raw = structuredClone(b);
    mutate(raw);
    assert.throws(() => validateBook(raw));
  }
});
test('real calendar dates and completed or overdue goals', () => {
  assert.ok(validDate('2024-02-29'));
  assert.ok(!validDate('2025-02-29'));
  const g = {
    id: 'g',
    name: 'test',
    target: 1000,
    saved: 1200,
    deadline: '2026-09-30',
  };
  assert.equal(remaining(g), 0);
  assert.equal(monthsLeft(g, '2026-08-31'), 2);
  assert.equal(monthsLeft(g, '2026-10-01'), 0);
});

test('backup preserves recorded time and notes while accepting old entries without time', () => {
  const b = demoBook();
  b.entries[0].time = '10:24';
  b.entries[0].note = '午饭，和朋友一起';
  const restored = validateBook(JSON.parse(JSON.stringify(b)));
  assert.equal(restored.entries[0].time, '10:24');
  assert.equal(restored.entries[0].note, '午饭，和朋友一起');
  assert.equal(restored.entries[1].time, undefined);
  for (const invalid of ['24:00', '10:60', '9:24', '', null, 1024]) {
    const raw = JSON.parse(JSON.stringify(b));
    raw.entries[0].time = invalid;
    assert.throws(() => validateBook(raw));
  }
});

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
} from './ledger.ts';
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

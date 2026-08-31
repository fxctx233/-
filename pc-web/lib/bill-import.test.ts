import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billMoment,
  buildImportedBook,
  decodeCSV,
  markDuplicates,
  parseCSV,
  rowsToBills,
  summarizeBills,
  reclassifyImported,
} from './bill-import.ts';
import { emptyBook, totals, validateBook, applyFundsChange } from './ledger.ts';
const header = [
  '交易时间',
  '交易分类',
  '交易对方',
  '对方账号',
  '商品说明',
  '收/支',
  '金额',
  '收/付款方式',
  '交易状态',
  '交易订单号',
  '商家订单号',
  '备注',
];
const row = (id: string, extra: Record<number, string> = {}) =>
  Object.assign(
    [
      '2026-08-01 10:24:36',
      '餐饮美食',
      '测试面馆',
      'private-account',
      '午餐',
      '支出',
      '25.50',
      '余额',
      '交易成功',
      id,
      'merchant-id',
      '',
    ],
    extra,
  );

void test('imported payment and refund adjust funds once; duplicate imports cannot charge again', async () => {
  const original = { ...emptyBook(), currentFunds: 100000 };
  const rows = await rowsToBills(
    [
      header,
      row('payment', { 6: '100.00' }),
      row('refund', { 1: '退款', 5: '收入', 6: '20.00', 8: '退款成功' }),
    ],
    'funds.csv',
    original,
  );
  const imported = applyFundsChange(
    original,
    buildImportedBook(original, rows, 'funds-batch'),
  );
  assert.equal(imported.currentFunds, 92000);
  assert.throws(() => buildImportedBook(imported, rows, 'duplicate-batch'));
  assert.equal(imported.currentFunds, 92000);
  const reclassified = applyFundsChange(
    imported,
    reclassifyImported(imported, rows).book,
  );
  assert.equal(reclassified.currentFunds, 92000);
  const undone = applyFundsChange(imported, { ...imported, entries: [] });
  assert.equal(undone.currentFunds, 100000);
});
void test('CSV supports GB18030, BOM, quotes, newlines and trailing columns', () => {
  assert.deepEqual(
    parseCSV('\ufeff时间,商品,金额,\r\n1,"饭,茶\r\n""加热""",25.50,\r\n'),
    [
      ['\ufeff时间', '商品', '金额', ''],
      ['1', '饭,茶\r\n"加热"', '25.50', ''],
    ],
  );
  assert.equal(decodeCSV(new Uint8Array([0xbd, 0xbb, 0xd2, 0xd7])), '交易');
  assert.throws(() => parseCSV('"broken'));
});
void test('Excel date serial matches Chinese wall clock and invalid dates fail', () => {
  const d = billMoment('46192.74377314815');
  assert.equal(d.date, '2026-06-19');
  assert.equal(d.time, '17:51');
  assert.equal(billMoment('2026/8/1 9:24:03').time, '09:24');
  assert.throws(() => billMoment('2026-02-30 12:00:00'));
  assert.throws(() => billMoment('2026-08-01 25:00:00'));
});
void test('original refunded payments and small personal transfers stay expenses; failed and account moves excluded', async () => {
  const rows = await rowsToBills(
    [
      ['前言'],
      header,
      row('normal'),
      row('refund', { 8: '退款成功' }),
      row('transfer', { 1: '转账' }),
      row('closed', { 8: '交易关闭' }),
      row('non', { 5: '不计收支' }),
      row('invalid', { 6: 'abc' }),
    ],
    'synthetic.csv',
    emptyBook(),
  );
  assert.equal(rows.length, 6);
  assert.deepEqual(
    rows.map((r) => r.include),
    [true, true, true, false, false, false],
  );
  assert.equal(rows[5].invalid, true);
  assert.equal(rows[0].category, '餐饮');
  assert.equal(JSON.stringify(rows).includes('private-account'), false);
});
void test('transaction ID dedupe survives edits and backup; exact timestamp collisions require only a warning', async () => {
  const b = emptyBook();
  const parsed = await rowsToBills(
    [header, row('a'), row('b'), row('a')],
    'test.csv',
    b,
  );
  const marked = markDuplicates(parsed, b);
  assert.equal(marked[1].possibleDuplicate, true);
  assert.equal(marked[1].duplicate, false);
  assert.equal(marked[2].duplicate, true);
  const next = buildImportedBook(
    b,
    [{ ...marked[0], include: true, activity: '旅行', remember: true }],
    'batch-a',
  );
  next.entries[0].cents = 100;
  const restored = validateBook(JSON.parse(JSON.stringify(next)));
  assert.equal(restored.entries[0].activity, '旅行');
  assert.equal(markDuplicates(parsed, restored)[0].duplicate, true);
  assert.throws(
    () => buildImportedBook(restored, [parsed[0]], 'batch-b'),
    /重复/,
  );
  assert.equal(restored.merchantRules?.length, 1);
  assert.throws(() =>
    validateBook({
      ...restored,
      entries: [
        {
          ...restored.entries[0],
          importInfo: { ...restored.entries[0].importInfo, key: 'bad' },
        },
      ],
    }),
  );
});
void test('import appends, does not overwrite, uses edited cents and requires classification', async () => {
  const b = emptyBook();
  const [p] = await rowsToBills([header, row('a')], 'test.csv', b);
  assert.throws(
    () => buildImportedBook(b, [{ ...p, category: '' }], 'one'),
    /分类/,
  );
  assert.throws(
    () => buildImportedBook(b, [{ ...p, amount: '0' }], 'one'),
    /大于零/,
  );
  const next = buildImportedBook(b, [{ ...p, amount: '20.25' }], 'one');
  const [q] = await rowsToBills(
    [header, row('b', { 0: '2026-08-02 11:00:00' })],
    'test.csv',
    next,
  );
  const merged = buildImportedBook(next, [q], 'two');
  assert.equal(merged.entries.length, 2);
  assert.equal(totals(merged.entries).expense, 4575);
  assert.equal(b.entries.length, 0);
  const undone = {
    ...merged,
    entries: merged.entries.filter((e) => e.importInfo?.batch !== 'two'),
  };
  assert.deepEqual(undone.entries, next.entries);
});
void test('consumer invoice headers are required; other successful-direction records get a default category', async () => {
  await assert.rejects(
    rowsToBills([['交易时间', '金额']], 'bad.csv', emptyBook()),
  );
  const [r] = await rowsToBills(
    [
      header,
      row('a', { 1: '酒店旅游', 2: '测试商家', 4: '住宿', 8: '未知状态' }),
    ],
    'test.csv',
    emptyBook(),
  );
  assert.equal(r.include, true);
  assert.equal(r.category, '住房');
});

void test('food keywords override original shopping category and old merchant rules', async () => {
  const b = emptyBook();
  b.merchantRules = [
    { source: 'alipay', merchant: '美团', kind: 'expense', category: '购物' },
  ];
  for (const name of ['肯德基', '美团', '蔬果', '饮料', '蜜雪冰城']) {
    const [r] = await rowsToBills(
      [header, row(name, { 1: '日用百货', 2: name, 4: '商品' })],
      'food.csv',
      b,
    );
    assert.equal(r.category, '餐饮');
    assert.equal(r.include, true);
    assert.equal(r.special, false);
  }
});
void test('less than 30 yuan personal outgoing transfers are food; 30 and incoming or own-account transfers are not', async () => {
  const items = await rowsToBills(
    [
      header,
      row('a', { 1: '转账', 2: '测试收款人', 4: '转账', 6: '29.99' }),
      row('b', { 1: '转账', 2: '测试收款人', 4: '转账', 6: '30.00' }),
      row('c', {
        1: '转账',
        2: '测试收款人',
        4: '转账',
        5: '收入',
        6: '20.00',
      }),
      row('d', { 1: '账户存取', 2: '测试收款人', 4: '转账', 6: '20.00' }),
    ],
    'transfer.csv',
    emptyBook(),
  );
  assert.deepEqual(
    items.map((r) => r.category),
    ['餐饮', '转账', '其他', '其他'],
  );
  assert.deepEqual(
    items.map((r) => r.include),
    [true, true, true, false],
  );
});
void test('supermarket and work rules classify expenses without changing refund or small-transfer rules', async () => {
  const b = emptyBook();
  b.merchantRules = [
    { source: 'alipay', merchant: '沃尔玛', kind: 'expense', category: '购物' },
  ];
  const entries = await rowsToBills(
    [
      header,
      row('market', { 1: '日用百货', 2: '沃尔玛', 4: '蔬果、饮料' }),
      row('local', { 2: '邻里生活超市', 4: '蜜雪冰城饮料' }),
      row('work', { 1: '日用百货', 2: '京东', 4: '办公耗材打印纸' }),
      row('shopping', { 1: '日用百货', 2: '京东', 4: '日常购物' }),
      row('refund-market', { 2: '沃尔玛', 5: '收入', 8: '退款成功' }),
      row('qr-large', {
        1: '扫二维码付款',
        2: '测试个人',
        4: '收款',
        6: '30.00',
      }),
      row('qr-small', {
        1: '扫二维码付款',
        2: '测试个人',
        4: '收款',
        6: '29.99',
      }),
    ],
    'categories.csv',
    b,
  );
  assert.deepEqual(
    entries.map((r) => r.category),
    ['综合购物', '综合购物', '工作需求', '购物', '退款', '转账', '餐饮'],
  );
  const oldBook = buildImportedBook(b, entries, 'old-batch');
  oldBook.entries[0].category = '购物';
  oldBook.entries[5].category = '其他';
  const updated = reclassifyImported(oldBook, entries);
  assert.equal(updated.changed, 2);
  assert.deepEqual(totals(updated.book.entries), totals(oldBook.entries));
  assert.deepEqual(
    updated.book.entries.map((e) => [
      e.id,
      e.date,
      e.time,
      e.note,
      e.importInfo,
    ]),
    oldBook.entries.map((e) => [e.id, e.date, e.time, e.note, e.importInfo]),
  );
  assert.equal(updated.book.entries.length, oldBook.entries.length);
});
void test('refund income preserves original expense and refund amount, including non-income Alipay receipts', async () => {
  const b = emptyBook();
  const entries = await rowsToBills(
    [
      header,
      row('payment', { 8: '已退款(¥5.00)', 6: '25.50' }),
      row('refund', {
        1: '退款',
        5: '不计收支',
        6: '5.00',
        8: '退款成功',
        0: '2026-08-02 10:00:00',
      }),
    ],
    'refund.csv',
    b,
  );
  assert.deepEqual(
    entries.map((r) => [r.kind, r.category, r.include]),
    [
      ['expense', '餐饮', true],
      ['income', '退款', true],
    ],
  );
  const result = buildImportedBook(b, entries, 'refund-batch');
  assert.deepEqual(totals(result.entries), {
    income: 500,
    expense: 2550,
    balance: -2050,
  });
  assert.equal(summarizeBills(entries).refund, 500);
  assert.equal(summarizeBills(entries).balance, -2050);
});
void test('same day and amount is not suspicious; full identical timestamps flag both different orders irrespective of amount', async () => {
  const b = emptyBook();
  const rows = await rowsToBills(
    [
      header,
      row('a'),
      row('b', { 0: '2026-08-01 10:24:37' }),
      row('c', { 0: '2026-08-01 10:24:37', 6: '99.00' }),
      row('d', { 0: '2026-08-02 10:24:37' }),
    ],
    'times.csv',
    b,
  );
  const marked = markDuplicates(rows, b);
  assert.deepEqual(
    marked.map((r) => r.possibleDuplicate),
    [false, true, true, false],
  );
  assert.deepEqual(
    marked.map((r) => r.include),
    [true, false, false, true],
  );
  const book = buildImportedBook(b, [rows[0]], 'saved');
  const restored = validateBook(JSON.parse(JSON.stringify(book)));
  assert.equal(
    restored.entries[0].importInfo?.timestamp,
    '2026-08-01 10:24:36',
  );
  const other = await rowsToBills(
    [header, row('other', { 6: '17.50' })],
    'other.csv',
    restored,
  );
  assert.equal(markDuplicates(other, restored)[0].possibleDuplicate, true);
  const minutes = await rowsToBills(
    [
      header,
      row('min1', { 0: '2026-08-01 10:24' }),
      row('min2', { 0: '2026-08-01 10:24' }),
    ],
    'minutes.csv',
    b,
  );
  assert.equal(
    markDuplicates(minutes, b).some((r) => r.possibleDuplicate),
    false,
  );
});
void test('selecting the same file again skips identical IDs without making the first copy suspicious', async () => {
  const b = emptyBook();
  const [r] = await rowsToBills([header, row('a')], 'a.csv', b);
  const marked = markDuplicates([r, { ...r, id: 'second-copy' }], b);
  assert.equal(marked[0].include, true);
  assert.equal(marked[0].possibleDuplicate, false);
  assert.equal(marked[1].duplicate, true);
});
void test('bulk reclassification updates imported categories, keeps money, notes, activity and unrelated manual entries', async () => {
  const b = emptyBook();
  const [r] = await rowsToBills(
    [header, row('old', { 2: '美团', 1: '文化休闲' })],
    'old.csv',
    b,
  );
  const old = buildImportedBook(
    b,
    [{ ...r, category: '娱乐', activity: '旅行' }],
    'first',
  );
  old.entries[0].cents = 1234;
  old.entries[0].note = '我修改的备注';
  const manual = {
    id: 'manual',
    date: '2026-08-01',
    kind: 'expense' as const,
    category: '工具',
    cents: 500,
    note: '手记',
  };
  old.entries.push(manual);
  const update = reclassifyImported(old, [r]);
  assert.equal(update.changed, 1);
  assert.equal(update.matched, 1);
  assert.equal(update.book.entries[0].category, '餐饮');
  assert.equal(update.book.entries[0].cents, 1234);
  assert.equal(update.book.entries[0].note, '我修改的备注');
  assert.equal(update.book.entries[0].activity, '旅行');
  assert.deepEqual(update.book.entries[1], manual);
  assert.equal(old.entries[0].category, '娱乐');
});
void test('paid orders awaiting delivery confirmation are expenses, while awaiting payment is excluded', async () => {
  const rows = await rowsToBills(
    [
      header,
      row('paid', { 8: '等待确认收货' }),
      row('unpaid', { 8: '等待付款' }),
    ],
    'status.csv',
    emptyBook(),
  );
  assert.equal(rows[0].include, true);
  assert.equal(rows[1].include, false);
});

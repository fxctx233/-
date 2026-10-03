import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyBook } from './ledger.ts';
import { syncGroupsToRows } from './read-only-sync.ts';

test('read-only sync parses local payment rows and keeps only dates after the checkpoint', () => {
  const rows = syncGroupsToRows(
    {
      status: 'complete',
      source: 'alipay',
      since: '2026-10-02',
      groups: [
        {
          capturedAt: new Date(2026, 9, 4, 12).getTime(),
          texts: ['肯德基', '2026-10-04 10:24:12', '- ￥28.50', '交易成功'],
        },
        {
          capturedAt: new Date(2026, 9, 4, 12).getTime(),
          texts: ['商家退款', '2026-10-03 08:00:00', '+￥6.00', '退款成功'],
        },
        {
          capturedAt: new Date(2026, 9, 4, 12).getTime(),
          texts: ['旧记录', '2026-10-02 09:00', '-￥10.00'],
        },
      ],
    },
    emptyBook(),
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => [row.kind, row.category, row.cents, row.date]),
    [
      ['expense', '餐饮', 2850, '2026-10-04'],
      ['income', '退款', 600, '2026-10-03'],
    ],
  );
  assert.equal(rows[0].timestamp, '2026-10-04 10:24:12');
});

test('read-only sync ignores unrelated screen text and deduplicates identical groups', () => {
  const group = {
    capturedAt: new Date(2026, 9, 4, 12).getTime(),
    texts: ['蜜雪冰城', '今天 11:20', '-￥9.00'],
  };
  const rows = syncGroupsToRows(
    {
      status: 'complete',
      source: 'wechat',
      groups: [
        group,
        group,
        { capturedAt: group.capturedAt, texts: ['钱包', '账单'] },
      ],
    },
    emptyBook(),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, '餐饮');
  assert.equal(rows[0].timestamp, '');
});

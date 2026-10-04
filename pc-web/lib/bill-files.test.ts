import assert from 'node:assert/strict';
import test from 'node:test';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { readBillFile } from './bill-files.ts';
import { emptyBook } from './ledger.ts';

const csv = [
  '交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注',
  '2026-08-01 10:24:36,餐饮美食,测试面馆,private-account,午餐,支出,25.50,余额,交易成功,zip-order,merchant-id,',
].join('\r\n');

async function archive(password: string, zipCrypto = false) {
  const output = new BlobWriter();
  const writer = new ZipWriter(output, { password, zipCrypto });
  await writer.add('支付宝交易明细.csv', new TextReader(csv));
  await writer.add('使用说明.txt', new TextReader('账单说明'));
  await writer.close();
  return new File([await output.getData()], '账单.zip', {
    type: 'application/zip',
  });
}

void test('encrypted AES and ZipCrypto ZIP bills import locally without extracting files', async () => {
  for (const zipCrypto of [false, true]) {
    const file = await archive('bill-password', zipCrypto);
    const rows = await readBillFile(file, emptyBook(), 'bill-password');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, '25.50');
    assert.equal(rows[0].category, '餐饮');
    assert.equal(JSON.stringify(rows).includes('private-account'), false);
  }
});

void test('wrong ZIP password does not produce preview rows', async () => {
  const file = await archive('correct-password');
  await assert.rejects(
    readBillFile(file, emptyBook(), 'wrong-password'),
    /密码/,
  );
  await assert.rejects(readBillFile(file, emptyBook()), /密码/);
});

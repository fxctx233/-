'use client';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { deviceStorage, isAndroidApp } from '@/lib/device';
import { money, type Book } from '@/lib/ledger';
import {
  importSyncRows,
  syncGroupsToRows,
  type NativeSyncState,
} from '@/lib/read-only-sync';
import type { Source } from '@/lib/bill-import';

const META = 'xiaoman-readonly-sync-meta';
type Meta = Partial<Record<Source, string>>;

export function ReadOnlySync({
  book,
  disabled,
  onCommit,
}: {
  book: Book;
  disabled: boolean;
  onCommit: (book: Book) => boolean;
}) {
  const [state, setState] = useState<NativeSyncState>({ status: 'idle' });
  const [meta, setMeta] = useState<Meta>({});
  const [notice, setNotice] = useState('');
  const [showDisclosure, setShowDisclosure] = useState(false);
  useEffect(() => {
    if (!isAndroidApp()) return;
    try {
      const saved = deviceStorage.getItem(META);
      if (saved) setMeta(JSON.parse(saved) as Meta);
    } catch {}
    const read = () => {
      try {
        const value = window.DailyLedgerAndroid?.getReadOnlySyncState?.();
        if (value) setState(JSON.parse(value) as NativeSyncState);
      } catch {
        setNotice('无法读取同步助手状态，请重新打开应用。');
      }
    };
    read();
    const timer = window.setInterval(read, 1200);
    return () => window.clearInterval(timer);
  }, []);
  const rows = useMemo(() => syncGroupsToRows(state, book), [state, book]);
  if (!isAndroidApp()) return null;
  const start = (source: Source) => {
    setNotice('');
    const result = window.DailyLedgerAndroid?.startReadOnlySync?.(
      source,
      meta[source] ?? '',
    );
    if (result === 'permission')
      setNotice('请先开启“日常记账只读同步助手”的辅助功能权限。');
    else if (result !== 'started') setNotice(result || '无法启动同步。');
  };
  const usable = rows.filter(
    (row) => row.include && !row.duplicate && !row.possibleDuplicate,
  );
  return (
    <section className="panel readonly-sync" aria-label="只读同步助手">
      <div className="toolbar">
        <div>
          <h2>
            只读同步助手 <span className="badge">实验版</span>
          </h2>
          <p className="muted">
            主动启动后沿“我的 → 账单”或“我 → 服务 → 钱包 → 账单”进入列表，并下滑读取较早记录；确认前不会改变余额。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowDisclosure(true)}
        >
          权限设置
        </Button>
      </div>
      {showDisclosure && (
        <div className="readonly-sync-disclosure" role="alert">
          <strong>开启前请确认</strong>
          <p>
            辅助功能允许本应用读取支付宝和微信当前显示的页面文字并执行固定点击、滚动。它只在你主动开始同步后运行，不读取聊天，不点击付款或验证；识别数据仅保存在本机。
          </p>
          <div className="flex flex-wrap">
            <Button
              type="button"
              onClick={() => {
                setShowDisclosure(false);
                window.DailyLedgerAndroid?.openReadOnlySyncSettings?.();
              }}
            >
              我了解，打开系统设置
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowDisclosure(false)}
            >
              暂不开启
            </Button>
          </div>
        </div>
      )}
      <div className="readonly-sync-actions">
        <Button
          type="button"
          disabled={disabled || state.status === 'running'}
          onClick={() => start('alipay')}
        >
          同步支付宝
          <small>上次：{meta.alipay || '未同步'}</small>
        </Button>
        <Button
          type="button"
          disabled={disabled || state.status === 'running'}
          onClick={() => start('wechat')}
        >
          同步微信
          <small>上次：{meta.wechat || '未同步'}</small>
        </Button>
      </div>
      {state.status === 'running' && (
        <div className="notice toolbar">
          <span>{state.message || '正在读取账单，请不要操作付款或转账。'}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.DailyLedgerAndroid?.stopReadOnlySync?.()}
          >
            停止
          </Button>
        </div>
      )}
      {(notice || state.status === 'error') && (
        <div className="error">{notice || state.message}</div>
      )}
      {state.status === 'complete' && (
        <div className="readonly-sync-result">
          <strong>
            识别到 {rows.length} 笔，其中 {usable.length} 笔可导入
          </strong>
          <span className="muted">
            合计 {money(usable.reduce((sum, row) => sum + row.cents, 0))}
            ；重复或时间完全相同的可疑记录自动跳过。
          </span>
          <div className="flex flex-wrap">
            <Button
              type="button"
              disabled={disabled || !usable.length}
              onClick={() => {
                try {
                  if (!state.source) throw new Error('同步来源缺失。');
                  const next = importSyncRows(book, rows, state.source);
                  if (!onCommit(next)) return;
                  const newest = usable
                    .map((row) => row.date)
                    .sort()
                    .at(-1);
                  const updated = {
                    ...meta,
                    ...(newest ? { [state.source]: newest } : {}),
                  };
                  setMeta(updated);
                  deviceStorage.setItem(META, JSON.stringify(updated));
                  window.DailyLedgerAndroid?.clearReadOnlySync?.();
                  setState({ status: 'idle' });
                  setNotice(`已导入 ${usable.length} 笔只读识别记录。`);
                } catch (error) {
                  setNotice((error as Error).message);
                }
              }}
            >
              确认导入
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                window.DailyLedgerAndroid?.clearReadOnlySync?.();
                setState({ status: 'idle' });
              }}
            >
              放弃结果
            </Button>
          </div>
          <details>
            <summary>查看识别日志</summary>
            <pre>{JSON.stringify(state.groups ?? [], null, 2)}</pre>
          </details>
        </div>
      )}
      <details className="muted">
        <summary>安全限制与使用说明</summary>
        <p>
          只点击“我、服务、钱包、账单”等固定入口；遇到密码、验证、付款或未知页面立即停止。支付宝或微信改版后可能暂时无法使用，可继续使用原有账单文件导入。
        </p>
      </details>
    </section>
  );
}

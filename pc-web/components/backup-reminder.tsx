'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { deviceStorage } from '@/lib/device';
import type { Book } from '@/lib/ledger';

const KEY = 'xiaoman-backup-status';
type Status = { at: number; hash: string };
async function fingerprint(value: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export function BackupReminder({
  book,
  settings,
  visible,
  onExport,
}: {
  book: Book;
  settings: boolean;
  visible: boolean;
  onExport: () => void;
}) {
  const [last, setLast] = useState<Status | null>(() => {
    try {
      const raw = deviceStorage.getItem(KEY);
      if (raw) {
        const x = JSON.parse(raw);
        if (Number.isFinite(x.at) && x.at > 0 && /^[a-f0-9]{64}$/.test(x.hash))
          return x;
      }
    } catch {}
    return null;
  });
  const [checked, setChecked] = useState<{ book: Book; hash: string } | null>(
    null,
  );
  const hash = checked?.book === book ? checked.hash : '';
  const [now, setNow] = useState(Date.now);
  const [pending, setPending] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    void fingerprint(JSON.stringify(book))
      .then((h) => {
        if (active) setChecked({ book, hash: h });
      })
      .catch(() => {
        if (active) setError('无法比较备份状态，请定期手动导出。');
      });
    return () => {
      active = false;
    };
  }, [book]);
  function remember(status: Status) {
    try {
      deviceStorage.setItem(KEY, JSON.stringify(status));
      setLast(status);
      setPending(null);
      setError('');
      setDismissed(false);
    } catch {
      setError('文件已导出，但备份提醒时间未能保存。');
    }
  }
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{ snapshot: string; confirmed: boolean }>
      ).detail;
      void fingerprint(detail.snapshot)
        .then((h) => {
          const status = { at: Date.now(), hash: h };
          if (detail.confirmed) remember(status);
          else setPending(status);
        })
        .catch(() => setError('无法更新备份提醒，请保管好导出的文件。'));
    };
    window.addEventListener('dailyLedgerFullBackup', handler);
    return () => window.removeEventListener('dailyLedgerFullBackup', handler);
  }, []);
  const hasData =
    book.entries.length +
      book.goals.length +
      (book.shoppingPlans?.length ?? 0) >
      0 || book.currentFunds !== undefined;
  const changed = !!hash && hash !== last?.hash;
  const due = hasData && changed && (!last || now - last.at >= 7 * 86400000);
  if (!visible || (!settings && !pending && (!due || dismissed))) return null;
  return (
    <section className="panel backup-reminder" aria-label="备份提醒">
      <h2>本地备份提醒</h2>
      <p>
        {last
          ? `最近确认备份：${new Date(last.at).toLocaleString('zh-CN')}`
          : '尚无本设备的备份确认记录。以前导出的文件仍然有效。'}
      </p>
      <p className="muted">
        {changed
          ? '当前账本有未确认备份的数据。'
          : hash
            ? '当前账本与最近确认的备份一致。'
            : '正在核对备份状态…'}{' '}
        完整备份包含收支、余额、存款和购物计划。
      </p>
      {due && (
        <p>建议现在导出一份备份。提醒仅在应用内显示，不会自动上传数据。</p>
      )}
      <div className="flex flex-wrap">
        <Button onClick={onExport}>导出完整备份</Button>
        {!settings && !pending && (
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            本次稍后提醒
          </Button>
        )}
      </div>
      {pending && (
        <div className="notice">
          <p>浏览器已发起下载。请先确认 JSON 文件已保存，再更新备份时间。</p>
          <div className="flex flex-wrap">
            <Button onClick={() => remember(pending)}>已保存文件</Button>
            <Button variant="outline" onClick={() => setPending(null)}>
              未保存 / 取消
            </Button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {settings && (
        <p className="muted">
          有新数据且距上次确认备份超过 7
          天时，在总览提醒。记录仅属于本设备，操作前自动副本不算完整文件备份。
        </p>
      )}
    </section>
  );
}

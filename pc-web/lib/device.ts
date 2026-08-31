// Android exposes this bridge only to the APK's bundled, offline page.
type AndroidBridge = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): string;
  exportBackup(name: string, content: string): void;
  importBackup(): void;
};
declare global {
  interface Window {
    DailyLedgerAndroid?: AndroidBridge;
  }
}
export function isAndroidApp() {
  return typeof window !== 'undefined' && !!window.DailyLedgerAndroid;
}
export const deviceStorage = {
  getItem(key: string): string | null {
    return isAndroidApp()
      ? window.DailyLedgerAndroid!.getItem(key)
      : localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    if (!isAndroidApp()) {
      localStorage.setItem(key, value);
      return;
    }
    const result = window.DailyLedgerAndroid!.setItem(key, value);
    if (result !== 'ok')
      throw new Error('本机保存失败，请导出备份并检查手机剩余空间。');
  },
};

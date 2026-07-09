import type { StoredReceipt } from "./schema";

/**
 * v1 のデータ保存はブラウザの localStorage を使う（DB・ログイン不要で完結）。
 * 将来 Vercel Postgres 等に差し替えるときは、この4関数の中身だけ変えればよい。
 */
const KEY = "receipt-kakeibo:receipts";

export function loadReceipts(): StoredReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredReceipt[]) : [];
  } catch {
    return [];
  }
}

export function saveReceipts(list: StoredReceipt[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

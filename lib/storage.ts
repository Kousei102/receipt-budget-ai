import type { Category, StoredReceipt } from "./schema";

/**
 * v1 のデータ保存はブラウザの localStorage を使う（DB・ログイン不要で完結）。
 * 将来 Vercel Postgres 等に差し替えるときは、この4関数の中身だけ変えればよい。
 */
const KEY = "receipt-kakeibo:receipts";

/** 旧形式（品目にカテゴリが無く、レシート全体に category を持っていた頃）の型。 */
type LegacyReceipt = Omit<StoredReceipt, "items"> & {
  category?: Category; // 旧: レシート全体のカテゴリ
  items: { name: string; price: number; category?: Category }[];
};

/**
 * 旧形式の保存データを新形式に寄せる。
 * カテゴリの無い品目には、旧レシートカテゴリ→無ければ「その他」を補う。
 */
function migrate(list: LegacyReceipt[]): StoredReceipt[] {
  return list.map((r) => ({
    ...r,
    items: (r.items ?? []).map((it) => ({
      name: it.name,
      price: it.price,
      category: it.category ?? r.category ?? "その他",
    })),
  }));
}

export function loadReceipts(): StoredReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw) as LegacyReceipt[]) : [];
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

import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, type Category, type StoredReceipt } from "./schema";

/**
 * v1 のデータ保存はブラウザの localStorage を使う（DB・ログイン不要で完結）。
 * 将来 Vercel Postgres 等に差し替えるときは、ここの関数群の中身だけ変えればよい。
 */
const KEY = "receipt-kakeibo:receipts";
const CAT_KEY = "receipt-kakeibo:categories";

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

/**
 * 保存に失敗し得る理由:
 *  - 容量超過（QuotaExceededError）: 画像は保存しないとはいえ件数が増えれば上限に達し得る
 *  - プライベートブラウジング等で localStorage への書き込みがブロックされる
 * 失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる（メモリ上のデータは残る）。
 */
export function saveReceipts(list: StoredReceipt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "データの保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

/**
 * ユーザー定義のカテゴリ一覧を読み込む。
 * 未保存・壊れているときは既定一覧を返す。フォールバックカテゴリ（その他）は
 * コードが受け皿として依存するため、欠けていれば必ず補う。
 */
export function loadCategories(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_CATEGORIES];
  try {
    const raw = window.localStorage.getItem(CAT_KEY);
    if (!raw) return [...DEFAULT_CATEGORIES];
    const parsed = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !parsed.every((c) => typeof c === "string" && c.length > 0)
    ) {
      return [...DEFAULT_CATEGORIES];
    }
    const list = parsed as string[];
    return list.includes(FALLBACK_CATEGORY) ? list : [...list, FALLBACK_CATEGORY];
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
}

/** カテゴリ一覧を保存する。失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる。 */
export function saveCategories(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CAT_KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "カテゴリの保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

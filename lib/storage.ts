import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, type Category, type StoredReceipt } from "./schema";
import type { RecurringExpense } from "./recurring";
import type { IncomeRecord, RecurringIncome } from "./income";

/**
 * v1 のデータ保存はブラウザの localStorage を使う（DB・ログイン不要で完結）。
 * 将来 Vercel Postgres 等に差し替えるときは、ここの関数群の中身だけ変えればよい。
 */
const KEY = "receipt-kakeibo:receipts";
const CAT_KEY = "receipt-kakeibo:categories";
const REC_KEY = "receipt-kakeibo:recurring";
const INCOME_KEY = "receipt-kakeibo:incomes";
const REC_INCOME_KEY = "receipt-kakeibo:recurring-incomes";
const GOAL_KEY = "receipt-kakeibo:savings-goal";
const API_KEY_KEY = "receipt-kakeibo:api-key";

/** 旧形式（品目カテゴリや source が無かった頃）の型。 */
type LegacyReceipt = Omit<StoredReceipt, "items" | "source"> & {
  category?: Category; // 旧: レシート全体のカテゴリ
  source?: StoredReceipt["source"]; // 旧: source 導入前は未保存
  items: { name: string; price: number; category?: Category }[];
};

/**
 * 旧形式の保存データを新形式に寄せる。
 * - カテゴリの無い品目には、旧レシートカテゴリ→無ければ「その他」を補う。
 * - source の無いレコードは全て画像抽出だった頃のものなので "receipt" を補う。
 */
function migrate(list: LegacyReceipt[]): StoredReceipt[] {
  return list.map((r) => ({
    ...r,
    source: r.source ?? "receipt",
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

/** 定期支出の定義一覧を読み込む。未保存・壊れているときは空配列。 */
export function loadRecurring(): RecurringExpense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REC_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecurringExpense[]) : [];
  } catch {
    return [];
  }
}

/** 定期支出の定義一覧を保存する。失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる。 */
export function saveRecurring(list: RecurringExpense[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REC_KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "定期支出の保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

/** 収入レコードの一覧を読み込む。未保存・壊れているときは空配列。 */
export function loadIncomes(): IncomeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INCOME_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as IncomeRecord[]) : [];
  } catch {
    return [];
  }
}

/** 収入レコードの一覧を保存する。失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる。 */
export function saveIncomes(list: IncomeRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INCOME_KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "収入の保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

/** 定期収入の定義一覧を読み込む。未保存・壊れているときは空配列。 */
export function loadRecurringIncomes(): RecurringIncome[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REC_INCOME_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecurringIncome[]) : [];
  } catch {
    return [];
  }
}

/** 定期収入の定義一覧を保存する。失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる。 */
export function saveRecurringIncomes(list: RecurringIncome[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REC_INCOME_KEY, JSON.stringify(list));
  } catch {
    throw new Error(
      "定期収入の保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

/**
 * 貯蓄目標（月額・円）を読み込む。未設定・壊れているときは 0（＝目標なし）。
 * 月ごとの個別設定はせず、グローバルな1つの値として扱う。
 */
export function loadSavingsGoal(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(GOAL_KEY);
    const n = raw ? Number(JSON.parse(raw)) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** 貯蓄目標を保存する。失敗は握り潰さず投げ、呼び出し側でユーザーに知らせる。 */
export function saveSavingsGoal(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GOAL_KEY, JSON.stringify(value));
  } catch {
    throw new Error(
      "貯蓄目標の保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

/**
 * ユーザー自身の Anthropic APIキー（BYOK）を読み込む。未設定・壊れているときは ""。
 * キーはこのブラウザにのみ保存し、抽出リクエスト時にヘッダーで中継する。
 */
export function loadApiKey(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(API_KEY_KEY);
    const parsed = raw ? JSON.parse(raw) : "";
    return typeof parsed === "string" ? parsed : "";
  } catch {
    return "";
  }
}

/** APIキーを保存する。空・空白のみならエントリごと削除（クリア動作）。失敗は投げる。 */
export function saveApiKey(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = key.trim();
    if (trimmed === "") {
      window.localStorage.removeItem(API_KEY_KEY);
    } else {
      window.localStorage.setItem(API_KEY_KEY, JSON.stringify(trimmed));
    }
  } catch {
    throw new Error(
      "APIキーの保存に失敗しました。ブラウザの空き容量やプライバシー設定をご確認ください。",
    );
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

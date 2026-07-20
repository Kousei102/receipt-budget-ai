import { CATEGORIES, type Category, type ReceiptItem } from "./schema";

/** カテゴリごとの色。グラフとカードのバッジで共通利用する。 */
export const CATEGORY_COLORS: Record<Category, string> = {
  食費: "#ef4444",
  日用品: "#f59e0b",
  外食: "#10b981",
  交通: "#3b82f6",
  娯楽: "#8b5cf6",
  その他: "#6b7280",
};

/** 数値を「¥1,234」形式に整形する。 */
export function yen(value: number): string {
  return "¥" + Math.round(value).toLocaleString("ja-JP");
}

/** confidence がこの値未満なら UI で「要確認」を出す。 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * 合計(total)と品目価格の合計がこの額（円）以上ずれていたら「要確認」を出す。
 * 読み取り漏れ・重複・値引きの取りこぼしなど、OCR ミスの有力なシグナル。
 */
export const TOTAL_MISMATCH_THRESHOLD = 1;

/** 品目価格の合計。合計との照合や自動再計算に使う。 */
export function sumItemPrices(items: ReceiptItem[]): number {
  return items.reduce((s, it) => s + (Number(it.price) || 0), 0);
}

/**
 * 品目群から、支出額が最も大きいカテゴリを求める。
 * レシート見出しのバッジ表示に使う派生値（品目カテゴリが単一の情報源）。
 * 品目が無ければ「その他」。
 */
export function dominantCategory(items: ReceiptItem[]): Category {
  const sums = new Map<Category, number>();
  for (const it of items) {
    sums.set(it.category, (sums.get(it.category) ?? 0) + it.price);
  }
  let best: Category = "その他";
  let bestSum = 0;
  for (const c of CATEGORIES) {
    const s = sums.get(c) ?? 0;
    if (s > bestSum) {
      bestSum = s;
      best = c;
    }
  }
  return best;
}

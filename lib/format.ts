import {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  type Category,
  type ReceiptItem,
} from "./schema";

/** 既定カテゴリの色。グラフとカードのバッジで共通利用する。 */
export const DEFAULT_CATEGORY_COLORS: Record<
  (typeof DEFAULT_CATEGORIES)[number],
  string
> = {
  食費: "#ef4444",
  日用品: "#f59e0b",
  外食: "#10b981",
  交通: "#3b82f6",
  娯楽: "#8b5cf6",
  その他: "#6b7280",
};

/**
 * ユーザー追加カテゴリ用の予備パレット。既定6色と重複しない色を並べる。
 * 名前から決定的に選ぶので、同じカテゴリ名は常に同じ色になる。
 */
const CUSTOM_PALETTE = [
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#eab308", // yellow
  "#0ea5e9", // sky
  "#f43f5e", // rose
];

/**
 * カテゴリ名から表示色を返す。既定カテゴリは固定色、それ以外は名前のハッシュで
 * CUSTOM_PALETTE から決定的に割り当てる（実行時に増えたカテゴリにも必ず色が付く）。
 */
export function categoryColor(name: string): string {
  if (name in DEFAULT_CATEGORY_COLORS) {
    return DEFAULT_CATEGORY_COLORS[name as (typeof DEFAULT_CATEGORIES)[number]];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash + name.charCodeAt(i)) % CUSTOM_PALETTE.length;
  }
  return CUSTOM_PALETTE[hash];
}

/** 数値を「¥1,234」形式に整形する。 */
export function yen(value: number): string {
  return "¥" + Math.round(value).toLocaleString("ja-JP");
}

/** "2026-03" を「2026年3月」に整形する（月次フィルタの表示用）。 */
export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
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
 * 実行時に増減するカテゴリに対応するため、固定一覧ではなく品目に現れたカテゴリだけで集計する。
 * 品目が無ければフォールバックカテゴリ。
 */
export function dominantCategory(items: ReceiptItem[]): Category {
  const sums = new Map<Category, number>();
  for (const it of items) {
    sums.set(it.category, (sums.get(it.category) ?? 0) + it.price);
  }
  let best: Category = FALLBACK_CATEGORY;
  let bestSum = 0;
  for (const [c, s] of sums) {
    if (s > bestSum) {
      bestSum = s;
      best = c;
    }
  }
  return best;
}

import type { Category } from "./schema";

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

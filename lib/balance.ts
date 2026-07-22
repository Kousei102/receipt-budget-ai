import type { StoredReceipt } from "./schema";
import type { IncomeRecord } from "./income";

/**
 * 収支サマリーの集計値。受け取るレコードは呼び出し側で期間フィルタ済みであること
 * （page.tsx の visibleReceipts / visibleIncomes と同じ絞り込みを前提とする）。
 */
export type Balance = {
  income: number; // 収入合計
  expense: number; // 支出合計（品目価格ベース）
  fixedExpense: number; // うち定期支出（内訳表示用）
  savingsGoal: number; // 貯蓄目標（月額）
  remaining: number; // あと使える額 = income − savingsGoal − expense
};

/**
 * 収支を集計する純関数。
 * 支出は items[].price の合計を使う（SummaryCharts のカテゴリ別集計と必ず一致させる。
 * total は実支払額だが、値引き行の扱いで品目合計とずれ得るため指標には使わない）。
 * 当月の定期支出はロード時に自動計上済みなので、「固定費の先取り」は追加計算なしで
 * expense に自然に含まれる。
 */
export function calcBalance(
  receipts: StoredReceipt[],
  incomes: IncomeRecord[],
  savingsGoal: number,
): Balance {
  let expense = 0;
  let fixedExpense = 0;
  for (const r of receipts) {
    const sum = r.items.reduce((s, it) => s + (Number(it.price) || 0), 0);
    expense += sum;
    if (r.source === "recurring") fixedExpense += sum;
  }
  const income = incomes.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return {
    income,
    expense,
    fixedExpense,
    savingsGoal,
    remaining: income - savingsGoal - expense,
  };
}

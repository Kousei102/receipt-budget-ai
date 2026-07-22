"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { StoredReceipt } from "@/lib/schema";
import type { IncomeRecord } from "@/lib/income";
import { calcBalance } from "@/lib/balance";
import { categoryColor, yen } from "@/lib/format";

type Props = {
  receipts: StoredReceipt[];
  /** 表示期間で絞り込み済みの収入（receipts と同じフィルタを適用したもの）。 */
  incomes: IncomeRecord[];
  /** 貯蓄目標（月額・円）。0 は目標なし。 */
  savingsGoal: number;
  /**
   * 表示期間の種別。「あと使える額」という言い方は当月にしか意味がないため、
   * 過去月は「収支」、全期間は収入・支出の合計のみに切り替える。
   */
  periodKind: "current" | "past" | "all";
};

/** 収支の符号付き表示（+¥1,234 / −¥1,234）。 */
function signedYen(value: number): string {
  return (value >= 0 ? "+" : "−") + yen(Math.abs(value));
}

/** レシート一覧をカテゴリ別に集計し、収支サマリー＋円グラフで可視化する。 */
export default function SummaryCharts({
  receipts,
  incomes,
  savingsGoal,
  periodKind,
}: Props) {
  // レシート単位ではなく、品目ごとのカテゴリで集計する。
  // カテゴリは実行時に増減するので、固定一覧ではなく品目に実在するカテゴリだけを集める。
  const totals = new Map<string, number>();
  for (const r of receipts) {
    for (const it of r.items) {
      totals.set(it.category, (totals.get(it.category) ?? 0) + it.price);
    }
  }
  const byCategory = Array.from(totals, ([category, total]) => ({
    category,
    total,
  })).filter((d) => d.total > 0);

  const grandTotal = byCategory.reduce((sum, d) => sum + d.total, 0);

  const balance = calcBalance(receipts, incomes, savingsGoal);
  // 収入も貯蓄目標も無いユーザーには従来どおり支出集計だけを見せる（初見の体験を壊さない）。
  const showBalance = balance.income > 0 || savingsGoal > 0;
  // 過去月の「収支」は実績（収入 − 支出）。貯蓄目標を引くのは当月の残額計算だけ。
  const netResult = balance.income - balance.expense;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {showBalance && (
        <div className="mb-4 border-b border-gray-100 pb-4 dark:border-gray-800">
          {periodKind === "current" && (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">今月あと使える額</h2>
                <p
                  className={
                    "text-2xl font-bold tabular-nums " +
                    (balance.remaining >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400")
                  }
                >
                  {balance.remaining >= 0
                    ? yen(balance.remaining)
                    : `${yen(Math.abs(balance.remaining))}の赤字`}
                </p>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                収入 {yen(balance.income)}
                {savingsGoal > 0 && <> − 貯蓄目標 {yen(savingsGoal)}</>} − 支出{" "}
                {yen(balance.expense)}
                {balance.fixedExpense > 0 && (
                  <>（うち固定費 {yen(balance.fixedExpense)}）</>
                )}
              </p>
            </>
          )}
          {periodKind === "past" && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">この月の収支</h2>
              <p className="text-sm text-gray-500">
                収入 {yen(balance.income)} − 支出 {yen(balance.expense)} ={" "}
                <span
                  className={
                    "text-xl font-bold tabular-nums " +
                    (netResult >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400")
                  }
                >
                  {signedYen(netResult)}
                </span>
              </p>
            </div>
          )}
          {periodKind === "all" && (
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">全期間の収支</h2>
              <p className="text-sm text-gray-500">
                収入{" "}
                <span className="font-bold text-gray-900 tabular-nums dark:text-gray-100">
                  {yen(balance.income)}
                </span>{" "}
                / 支出{" "}
                <span className="font-bold text-gray-900 tabular-nums dark:text-gray-100">
                  {yen(balance.expense)}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">カテゴリ別支出</h2>
        <p className="text-sm text-gray-500">
          合計{" "}
          <span className="text-xl font-bold text-gray-900 tabular-nums dark:text-gray-100">
            {yen(grandTotal)}
          </span>
        </p>
      </div>

      {byCategory.length === 0 ? (
        <p className="mt-4 text-center text-sm text-gray-400">
          この期間の支出はありません。
        </p>
      ) : (
        <div className="mt-2 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={byCategory}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={(props: unknown) =>
                  (props as { category?: string }).category ?? ""
                }
              >
                {byCategory.map((d) => (
                  <Cell key={d.category} fill={categoryColor(d.category)} />
                ))}
              </Pie>
              <Tooltip formatter={(value: unknown) => yen(Number(value))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CATEGORIES, type StoredReceipt } from "@/lib/schema";
import { CATEGORY_COLORS, yen } from "@/lib/format";

type Props = {
  receipts: StoredReceipt[];
};

/** レシート一覧をカテゴリ別に集計し、円グラフ＋合計で可視化する。 */
export default function SummaryCharts({ receipts }: Props) {
  const byCategory = CATEGORIES.map((category) => ({
    category,
    total: receipts
      .filter((r) => r.category === category)
      .reduce((sum, r) => sum + r.total, 0),
  })).filter((d) => d.total > 0);

  const grandTotal = byCategory.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">カテゴリ別支出</h2>
        <p className="text-sm text-gray-500">
          合計{" "}
          <span className="text-xl font-bold text-gray-900 tabular-nums dark:text-gray-100">
            {yen(grandTotal)}
          </span>
        </p>
      </div>

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
                <Cell key={d.category} fill={CATEGORY_COLORS[d.category]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: unknown) => yen(Number(value))} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

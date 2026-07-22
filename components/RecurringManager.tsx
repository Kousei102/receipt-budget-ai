"use client";

import { useState } from "react";
import { FALLBACK_CATEGORY } from "@/lib/schema";
import { categoryColor, formatMonthLabel, yen } from "@/lib/format";
import type { RecurringExpense } from "@/lib/recurring";

type Props = {
  defs: RecurringExpense[];
  categories: string[];
  onAdd: (
    def: Omit<RecurringExpense, "id" | "createdAt" | "lastPostedMonth">,
  ) => void;
  onDelete: (id: string) => void;
};

/** 今月をローカルタイムで "YYYY-MM" にする（フォームの開始月の既定値）。 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * 定期支出（家賃・サブスク等）の追加・削除 UI。設定的な位置づけなので折りたたみで表示する。
 * v1 は追加・削除のみ（内容の変更は削除→再作成で代替）。
 */
export default function RecurringManager({
  defs,
  categories,
  onAdd,
  onDelete,
}: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(FALLBACK_CATEGORY);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startMonth, setStartMonth] = useState(currentMonth());
  const [endMonth, setEndMonth] = useState("");

  const trimmedName = name.trim();
  const amountNum = Number(amount);
  const dayNum = Number(dayOfMonth);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const validDay = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31;
  const validPeriod = endMonth === "" || endMonth >= startMonth;
  const canAdd =
    trimmedName.length > 0 &&
    validAmount &&
    validDay &&
    /^\d{4}-\d{2}$/.test(startMonth) &&
    validPeriod;

  function handleAdd() {
    if (!canAdd) return;
    onAdd({
      name: trimmedName,
      amount: amountNum,
      category: categories.includes(category) ? category : FALLBACK_CATEGORY,
      dayOfMonth: dayNum,
      startMonth,
      endMonth: endMonth || undefined,
    });
    setName("");
    setAmount("");
  }

  function handleDelete(def: RecurringExpense) {
    if (
      !window.confirm(
        `定期支出「${def.name}」を削除します。計上済みのレコードは残ります（今後の自動計上のみ停止します）。よろしいですか？`,
      )
    ) {
      return;
    }
    onDelete(def.id);
  }

  return (
    <details className="mt-8 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
        🔁 定期支出を管理（家賃・サブスクなど）
      </summary>

      {defs.length === 0 ? (
        <p className="mt-3 text-gray-500">
          定期支出はまだありません。追加すると、開始月から当月までのぶんが自動で計上されます。
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {defs.map((def) => (
            <li key={def.id} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(def.category) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                {def.name}
              </span>
              <span className="shrink-0 tabular-nums">{yen(def.amount)}</span>
              <span className="shrink-0 text-xs text-gray-400">
                毎月{def.dayOfMonth}日 / {formatMonthLabel(def.startMonth)}〜
                {def.endMonth ? formatMonthLabel(def.endMonth) : ""}
              </span>
              <button
                onClick={() => handleDelete(def)}
                aria-label={`定期支出「${def.name}」を削除`}
                className="shrink-0 px-1 text-red-600 hover:text-red-800 dark:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名目（例: 家賃）"
          className="col-span-2 rounded border border-gray-300 px-2 py-1 sm:col-span-1 dark:border-gray-700 dark:bg-gray-800"
        />
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="金額（円）"
          min={1}
          className="rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-700 dark:bg-gray-800"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-gray-300 px-1 py-1 dark:border-gray-700 dark:bg-gray-800"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          支払日
          <input
            type="number"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            min={1}
            max={31}
            className="w-14 rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-700 dark:bg-gray-800"
          />
          日
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          開始
          <input
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          終了
          <input
            type="month"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            min={startMonth}
            className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1 dark:border-gray-700 dark:bg-gray-800"
          />
        </label>
      </div>
      {!validPeriod && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          終了月は開始月以降にしてください。
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-gray-400">
          追加すると開始月から当月までを自動計上します。終了月は空欄で無期限。
        </p>
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="shrink-0 rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          追加
        </button>
      </div>
    </details>
  );
}

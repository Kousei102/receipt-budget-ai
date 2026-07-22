"use client";

import { useState } from "react";
import type { IncomeRecord, RecurringIncome } from "@/lib/income";
import { formatMonthLabel, yen } from "@/lib/format";

type Props = {
  /** 表示期間で絞り込み済みの収入レコード（page.tsx の visibleIncomes）。 */
  incomes: IncomeRecord[];
  defs: RecurringIncome[];
  savingsGoal: number;
  onAddIncome: (input: { name: string; date: string; amount: number }) => void;
  onDeleteIncome: (id: string) => void;
  onAddDef: (
    def: Omit<RecurringIncome, "id" | "createdAt" | "lastPostedMonth">,
  ) => void;
  /** 定義の内容変更。今後の自動計上分にのみ反映される（計上済みレコードは触らない）。 */
  onUpdateDef: (
    id: string,
    patch: Omit<RecurringIncome, "id" | "createdAt" | "lastPostedMonth">,
  ) => void;
  onDeleteDef: (id: string) => void;
  onSetSavingsGoal: (value: number) => void;
};

/** 今月をローカルタイムで "YYYY-MM" にする（フォームの開始月の既定値）。 */
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 今日をローカルタイムで "YYYY-MM-DD" にする（手入力の日付の既定値）。 */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 収入（手入力・定期収入の定義）と貯蓄目標の管理 UI。
 * RecurringManager と同じく設定的な位置づけなので折りたたみで表示する。
 * 定期収入の編集は追加フォームを使い回し、変更は今後の自動計上分にのみ反映される。
 */
export default function IncomeManager({
  incomes,
  defs,
  savingsGoal,
  onAddIncome,
  onDeleteIncome,
  onAddDef,
  onUpdateDef,
  onDeleteDef,
  onSetSavingsGoal,
}: Props) {
  // 貯蓄目標の入力欄。localStorage からの復元がマウント後に来るため prop と同期する。
  // effect ではなくレンダー中に前回値と比較して調整する（React 推奨パターン）。
  const [goalInput, setGoalInput] = useState(savingsGoal > 0 ? String(savingsGoal) : "");
  const [prevGoal, setPrevGoal] = useState(savingsGoal);
  if (prevGoal !== savingsGoal) {
    setPrevGoal(savingsGoal);
    setGoalInput(savingsGoal > 0 ? String(savingsGoal) : "");
  }

  // 手入力の収入フォーム。
  const [incomeName, setIncomeName] = useState("");
  const [incomeDate, setIncomeDate] = useState(todayLocal());
  const [incomeAmount, setIncomeAmount] = useState("");

  // 定期収入の定義フォーム（編集は使い回し。editingId が null なら追加モード）。
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("25");
  const [startMonth, setStartMonth] = useState(currentMonth());
  const [endMonth, setEndMonth] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const goalNum = Number(goalInput);
  const validGoal = goalInput === "" || (Number.isFinite(goalNum) && goalNum >= 0);
  const goalChanged = (goalInput === "" ? 0 : goalNum) !== savingsGoal;

  const incomeAmountNum = Number(incomeAmount);
  const canAddIncome =
    incomeName.trim().length > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(incomeDate) &&
    Number.isFinite(incomeAmountNum) &&
    incomeAmountNum > 0;

  const trimmedName = name.trim();
  const amountNum = Number(amount);
  const dayNum = Number(dayOfMonth);
  const validAmount = Number.isFinite(amountNum) && amountNum > 0;
  const validDay = Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31;
  const validPeriod = endMonth === "" || endMonth >= startMonth;
  const canSubmitDef =
    trimmedName.length > 0 &&
    validAmount &&
    validDay &&
    /^\d{4}-\d{2}$/.test(startMonth) &&
    validPeriod;

  function handleSaveGoal() {
    if (!validGoal) return;
    onSetSavingsGoal(goalInput === "" ? 0 : goalNum);
  }

  function handleAddIncome() {
    if (!canAddIncome) return;
    onAddIncome({
      name: incomeName.trim(),
      date: incomeDate,
      amount: incomeAmountNum,
    });
    // 続けて追加しやすいよう、日付は残して名目と金額だけ空にする。
    setIncomeName("");
    setIncomeAmount("");
  }

  /** 定義フォームを初期状態（追加モード）に戻す。 */
  function resetDefForm() {
    setEditingId(null);
    setName("");
    setAmount("");
    setDayOfMonth("25");
    setStartMonth(currentMonth());
    setEndMonth("");
  }

  /** 定義の値をフォームにロードして編集モードに入る。 */
  function startEdit(def: RecurringIncome) {
    setEditingId(def.id);
    setName(def.name);
    setAmount(String(def.amount));
    setDayOfMonth(String(def.dayOfMonth));
    setStartMonth(def.startMonth);
    setEndMonth(def.endMonth ?? "");
  }

  function handleSubmitDef() {
    if (!canSubmitDef) return;
    const input = {
      name: trimmedName,
      amount: amountNum,
      dayOfMonth: dayNum,
      startMonth,
      endMonth: endMonth || undefined,
    };
    if (editingId) {
      onUpdateDef(editingId, input);
      resetDefForm();
    } else {
      onAddDef(input);
      setName("");
      setAmount("");
    }
  }

  function handleDeleteDef(def: RecurringIncome) {
    if (
      !window.confirm(
        `定期収入「${def.name}」を削除します。計上済みのレコードは残ります（今後の自動計上のみ停止します）。よろしいですか？`,
      )
    ) {
      return;
    }
    if (def.id === editingId) resetDefForm();
    onDeleteDef(def.id);
  }

  return (
    <details className="mt-8 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
        💰 収入・貯蓄目標を管理
      </summary>

      {/* 貯蓄目標 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="savings-goal" className="text-gray-600 dark:text-gray-400">
          貯蓄目標（月額）
        </label>
        <input
          id="savings-goal"
          type="number"
          value={goalInput}
          onChange={(e) => setGoalInput(e.target.value)}
          placeholder="0"
          min={0}
          className="w-28 rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-700 dark:bg-gray-800"
        />
        <span className="text-gray-500">円</span>
        <button
          onClick={handleSaveGoal}
          disabled={!validGoal || !goalChanged}
          className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          保存
        </button>
        <span className="text-xs text-gray-400">
          「あと使える額」は 収入 − 貯蓄目標 − 支出 で計算します。
        </span>
      </div>

      {/* 定期収入の定義 */}
      <h3 className="mt-5 font-medium text-gray-700 dark:text-gray-300">
        🔁 定期収入（給与など）
      </h3>
      {defs.length === 0 ? (
        <p className="mt-2 text-gray-500">
          定期収入はまだありません。追加すると、開始月から当月までのぶんが自動で計上されます。
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {defs.map((def) => (
            <li
              key={def.id}
              className={
                "flex items-center gap-2 rounded px-1" +
                (editingId === def.id ? " bg-blue-50 dark:bg-blue-950/40" : "")
              }
            >
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                {def.name}
              </span>
              <span className="shrink-0 tabular-nums">{yen(def.amount)}</span>
              <span className="shrink-0 text-xs text-gray-400">
                毎月{def.dayOfMonth}日 / {formatMonthLabel(def.startMonth)}〜
                {def.endMonth ? formatMonthLabel(def.endMonth) : ""}
              </span>
              <button
                onClick={() => startEdit(def)}
                aria-label={`定期収入「${def.name}」を編集`}
                className="shrink-0 px-1 text-blue-600 hover:underline dark:text-blue-400"
              >
                {editingId === def.id ? "編集中" : "編集"}
              </button>
              <button
                onClick={() => handleDeleteDef(def)}
                aria-label={`定期収入「${def.name}」を削除`}
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
          placeholder="名目（例: 給与）"
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
        <label className="flex items-center gap-1 text-xs text-gray-500">
          支給日
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
          {editingId
            ? "変更は今後の自動計上分から反映されます。計上済みのレコードは変わりません。"
            : "追加すると開始月から当月までを自動計上します。終了月は空欄で無期限。"}
        </p>
        <div className="flex shrink-0 gap-2">
          {editingId && (
            <button
              onClick={resetDefForm}
              className="rounded border border-gray-300 px-3 py-1 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
            >
              キャンセル
            </button>
          )}
          <button
            onClick={handleSubmitDef}
            disabled={!canSubmitDef}
            className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {editingId ? "更新" : "追加"}
          </button>
        </div>
      </div>

      {/* 収入レコード（手入力＋一覧） */}
      <h3 className="mt-5 font-medium text-gray-700 dark:text-gray-300">
        📝 収入の記録
      </h3>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          value={incomeName}
          onChange={(e) => setIncomeName(e.target.value)}
          placeholder="名目（例: フリマ売上）"
          className="col-span-2 rounded border border-gray-300 px-2 py-1 sm:col-span-1 dark:border-gray-700 dark:bg-gray-800"
        />
        <input
          type="date"
          value={incomeDate}
          onChange={(e) => setIncomeDate(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
        />
        <input
          type="number"
          value={incomeAmount}
          onChange={(e) => setIncomeAmount(e.target.value)}
          placeholder="金額（円）"
          min={1}
          className="rounded border border-gray-300 px-2 py-1 text-right dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          onClick={handleAddIncome}
          disabled={!canAddIncome}
          className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          追加
        </button>
      </div>

      {incomes.length === 0 ? (
        <p className="mt-2 text-gray-500">この期間の収入はまだありません。</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {incomes.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded px-1">
              <span className="shrink-0 text-xs text-gray-400 tabular-nums">
                {r.date}
              </span>
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                {r.name}
              </span>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {r.source === "recurring" ? "定期" : "手入力"}
              </span>
              <span className="shrink-0 font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
                +{yen(r.amount)}
              </span>
              <button
                onClick={() => onDeleteIncome(r.id)}
                aria-label={`収入「${r.name}」を削除`}
                className="shrink-0 px-1 text-red-600 hover:text-red-800 dark:text-red-400"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

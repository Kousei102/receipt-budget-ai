import {
  clampDay,
  enumerateMonthsToPost,
  type RecurringExpense,
} from "./recurring";
import { newId } from "./storage";

/**
 * 収入まわりの型と定期収入の自動計上ロジック。
 * 収入は支出（StoredReceipt）と混ぜない：集計・CSV・重複検知はすべて支出前提のため、
 * 別の型・別の localStorage キー（lib/storage.ts の loadIncomes/saveIncomes）で管理する。
 */

/** 収入レコードの入力経路。画像からのAI抽出は対象外（手入力と定期のみ）。 */
export type IncomeSource = "manual" | "recurring";

/** 収入レコード。カテゴリは持たない（名目のみ）。 */
export type IncomeRecord = {
  id: string;
  createdAt: string; // ISO文字列
  source: IncomeSource;
  // 定期収入（source: "recurring"）の冪等タグ。どの定義のどの月分かを示す。
  recurringId?: string;
  recurringMonth?: string; // "YYYY-MM"
  name: string; // 名目（給与・フリマ売上など）
  date: string; // "YYYY-MM-DD"
  amount: number; // 円
};

/**
 * 定期収入（給与等）の定義。RecurringExpense から category を除いた形。
 * 冪等セマンティクスは定期支出と同一（lastPostedMonth カーソルが主ガード、
 * 定義の編集は今後の計上分にのみ反映、計上済みレコードは書き換えない）。
 */
export type RecurringIncome = Omit<RecurringExpense, "category">;

/**
 * 未計上の月ぶんの収入レコードを生成する（純関数）。
 * materializeRecurring（定期支出）と対称の実装で、月列挙は enumerateMonthsToPost を共有する。
 * 当月分は給料日未到来でも計上する（「あと使える額」が月初から安定する）。
 *
 * 冪等性の二段構えも定期支出と同一:
 *  1. 主: lastPostedMonth カーソル（計上済みの月は二度と生成しない。削除しても復活しない）
 *  2. 従: existing の recurringId + recurringMonth 存在チェック（複数タブ同時ロードの緩和）
 */
export function materializeRecurringIncome(
  defs: RecurringIncome[],
  existing: IncomeRecord[],
  nowMonth: string, // ローカルタイムの "YYYY-MM"
): { defs: RecurringIncome[]; created: IncomeRecord[] } {
  const posted = new Set(
    existing
      .filter((r) => r.recurringId && r.recurringMonth)
      .map((r) => `${r.recurringId}:${r.recurringMonth}`),
  );
  const created: IncomeRecord[] = [];

  const nextDefs = defs.map((def) => {
    const { months, lastPostedMonth } = enumerateMonthsToPost(def, nowMonth);
    if (months.length === 0) return def;

    for (const m of months) {
      if (posted.has(`${def.id}:${m}`)) continue;
      created.push({
        id: newId(),
        createdAt: new Date().toISOString(),
        source: "recurring",
        recurringId: def.id,
        recurringMonth: m,
        name: def.name,
        date: clampDay(def.dayOfMonth, m),
        amount: def.amount,
      });
    }
    return { ...def, lastPostedMonth };
  });

  return { defs: nextDefs, created };
}

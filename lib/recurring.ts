import type { StoredReceipt } from "./schema";
import { newId } from "./storage";

/**
 * 定期支出（家賃・サブスク等）の定義。
 * 定義そのものは支出レコードではなく、ここから毎月 StoredReceipt（source: "recurring"）を
 * 自動生成（計上）する。実体は localStorage（lib/storage.ts の loadRecurring/saveRecurring）。
 */
export type RecurringExpense = {
  id: string;
  name: string; // 支払先/名目（store と品目名に使う）
  amount: number; // 月額（円）
  category: string;
  dayOfMonth: number; // 支払日 1..31（月末を超える場合は月末に丸める）
  startMonth: string; // "YYYY-MM"。この月から計上する
  endMonth?: string; // "YYYY-MM"。省略時は無期限
  /**
   * 冪等カーソル。この月まで計上済みであることを示す。
   * receipts の存在チェックではなくカーソルを主ガードにすることで、
   * ユーザーが計上済みレコードを削除しても次回ロードで復活しない。
   */
  lastPostedMonth?: string;
  createdAt: string; // ISO文字列
};

/** "YYYY-MM" に months ヶ月を足す。 */
export function addMonths(ym: string, months: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 支払日を月の実日数に丸めて "YYYY-MM-DD" を作る（例: 31日 × 2月 → 2/28）。 */
export function clampDay(dayOfMonth: number, ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // 翌月0日 = 当月末日
  const day = Math.min(Math.max(1, dayOfMonth), lastDay);
  return `${ym}-${String(day).padStart(2, "0")}`;
}

/** 定期計上のスケジュール部分。定期支出・定期収入の両方がこの形を持つ。 */
export type RecurringSchedule = {
  startMonth: string; // "YYYY-MM"
  endMonth?: string; // "YYYY-MM"。省略時は無期限
  lastPostedMonth?: string; // 冪等カーソル
};

/**
 * 計上すべき月（"YYYY-MM"）の一覧と、進めたカーソルを返す純関数。
 * max(startMonth, lastPostedMonth の翌月) 〜 min(nowMonth, endMonth) を列挙する。
 * 当月分は支払日未到来でも含める（予定として集計に載せる）。
 * 定期支出（materializeRecurring）と定期収入（lib/income.ts）で共有する。
 *
 * "YYYY-MM" 同士の大小は辞書順比較で正しく判定できる。
 */
export function enumerateMonthsToPost(
  def: RecurringSchedule,
  nowMonth: string,
): { months: string[]; lastPostedMonth?: string } {
  const from = def.lastPostedMonth
    ? addMonths(def.lastPostedMonth, 1)
    : def.startMonth;
  const start = from > def.startMonth ? from : def.startMonth;
  const end = def.endMonth && def.endMonth < nowMonth ? def.endMonth : nowMonth;
  if (start > end) return { months: [], lastPostedMonth: def.lastPostedMonth };

  const months: string[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) months.push(m);
  return { months, lastPostedMonth: end };
}

/**
 * 未計上の月ぶんの支出レコードを生成する（純関数）。
 * 各定義について enumerateMonthsToPost で計上すべき月を列挙し、まだ存在しない月のレコードを作る。
 * 当月分は支払日未到来でも計上する（予定支出として集計に載せる）。
 *
 * 冪等性の二段構え:
 *  1. 主: lastPostedMonth カーソル（計上済みの月は二度と生成しない。削除しても復活しない）
 *  2. 従: existing の recurringId + recurringMonth 存在チェック（複数タブ同時ロードの緩和）
 */
export function materializeRecurring(
  defs: RecurringExpense[],
  existing: StoredReceipt[],
  nowMonth: string, // ローカルタイムの "YYYY-MM"
): { defs: RecurringExpense[]; created: StoredReceipt[] } {
  const posted = new Set(
    existing
      .filter((r) => r.recurringId && r.recurringMonth)
      .map((r) => `${r.recurringId}:${r.recurringMonth}`),
  );
  const created: StoredReceipt[] = [];

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
        store: def.name,
        date: clampDay(def.dayOfMonth, m),
        items: [{ name: def.name, price: def.amount, category: def.category }],
        total: def.amount,
        confidence: 1, // ユーザー定義由来なので要確認バッジは不要
      });
    }
    return { ...def, lastPostedMonth };
  });

  return { defs: nextDefs, created };
}

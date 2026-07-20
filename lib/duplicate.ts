import type { Receipt } from "./schema";

/** 金額比較の許容誤差（円）。 */
const TOTAL_EPSILON = 1;

/** 店名を比較用に正規化する（空白除去＋小文字化）。eval/run-eval.ts の norm と同じ規則。 */
export function normalizeStore(store: string): string {
  return store.replace(/\s/g, "").toLowerCase();
}

/** candidate が existing と「同一レシート」とみなせるか（店名・日付・合計の3点一致）。 */
export function isDuplicateReceipt(
  candidate: Receipt,
  existing: Pick<Receipt, "store" | "date" | "total">,
): boolean {
  return (
    normalizeStore(candidate.store) === normalizeStore(existing.store) &&
    candidate.date === existing.date &&
    Math.abs(candidate.total - existing.total) < TOTAL_EPSILON
  );
}

/** candidate が list 内のいずれかと重複するか判定し、最初に一致した相手を返す。 */
export function findDuplicate<T extends Pick<Receipt, "store" | "date" | "total">>(
  candidate: Receipt,
  list: T[],
): T | undefined {
  return list.find((r) => isDuplicateReceipt(candidate, r));
}

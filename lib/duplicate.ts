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

/**
 * 緩い比較用の店名正規化。NFKC で半角カナ→全角・全角英数→半角を吸収したうえで
 * 空白除去・小文字化し、法人格を取り除く（明細の「ｲｵﾝﾘﾃｰﾙ」とレシートの「イオン」を寄せる）。
 */
export function normalizeStoreLoose(store: string): string {
  return store
    .normalize("NFKC")
    .replace(/\s/g, "")
    .toLowerCase()
    .replace(/株式会社|\(株\)|（株）|有限会社|\(有\)|（有）|合同会社/g, "");
}

/** 日付差の許容日数。カード明細の利用日は店頭レシートと1〜2日ずれることがある（売上確定遅れ等）。 */
const LOOSE_DATE_WINDOW_DAYS = 3;

function dateDiffDays(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/**
 * カード明細と店頭レシートの二重計上を疑う「緩い一致」。
 * 店名は正規化後の部分一致（片方がもう片方を含む）、日付は±3日、金額は既存と同じ±1円。
 * 金額を緩めないのは、カード明細の金額は正確でずれる理由が無いため。
 */
export function isLooseDuplicate(
  a: Pick<Receipt, "store" | "date" | "total">,
  b: Pick<Receipt, "store" | "date" | "total">,
): boolean {
  const na = normalizeStoreLoose(a.store);
  const nb = normalizeStoreLoose(b.store);
  // 1文字以下の店名は何にでも部分一致してしまうので不適用。
  if (na.length < 2 || nb.length < 2) return false;
  return (
    (na.includes(nb) || nb.includes(na)) &&
    dateDiffDays(a.date, b.date) <= LOOSE_DATE_WINDOW_DAYS &&
    Math.abs(a.total - b.total) < TOTAL_EPSILON
  );
}

/**
 * 「カード明細 vs それ以外」のペアに限定して緩い一致を探し、最初に一致した相手を返す。
 * 全レコード間に適用すると（毎週同じスーパーで同額の買い物など）誤検知が増えるため、
 * source の片方だけが "card" である組み合わせにだけ適用する。
 */
export function findLooseCrossSourceDuplicate<
  T extends Pick<Receipt, "store" | "date" | "total"> & { source: string },
>(candidate: Receipt & { source: string }, list: T[]): T | undefined {
  return list.find(
    (r) =>
      (candidate.source === "card") !== (r.source === "card") &&
      isLooseDuplicate(candidate, r),
  );
}

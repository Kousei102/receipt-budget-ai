import type { StoredReceipt } from "./schema";

/** CSV セル用エスケープ。カンマ・引用符・改行を含む値を安全にする（RFC 4180 準拠）。 */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * レシートを「品目1行」のロング形式 CSV に変換する。
 * 列: 購入日, 店名, 品目, カテゴリ, 金額
 * - 品目が空のレシートは、合計を金額に入れた1行として残す（データを取りこぼさない）。
 * - Excel(日本語)での文字化けを防ぐ BOM は付けない。付与は呼び出し側（ダウンロード時）で行う。
 */
export function receiptsToCsv(receipts: StoredReceipt[]): string {
  const rows: string[][] = [["購入日", "店名", "品目", "カテゴリ", "金額"]];
  for (const r of receipts) {
    if (r.items.length === 0) {
      rows.push([r.date, r.store, "", "", String(r.total)]);
      continue;
    }
    for (const it of r.items) {
      rows.push([r.date, r.store, it.name, it.category, String(it.price)]);
    }
  }
  return rows.map((cols) => cols.map(csvCell).join(",")).join("\r\n");
}

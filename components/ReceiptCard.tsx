"use client";

import { useState } from "react";
import {
  CATEGORIES,
  type Category,
  type ReceiptItem,
  type StoredReceipt,
} from "@/lib/schema";
import { CATEGORY_COLORS, yen, LOW_CONFIDENCE_THRESHOLD } from "@/lib/format";

type Props = {
  receipt: StoredReceipt;
  onUpdate: (id: string, patch: Partial<StoredReceipt>) => void;
  onDelete: (id: string) => void;
};

/** 1枚のレシート抽出結果。要確認バッジ・手修正・削除に対応。 */
export default function ReceiptCard({ receipt, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const lowConfidence = receipt.confidence < LOW_CONFIDENCE_THRESHOLD;

  /** 品目の値段合計。合計の自動再計算に使う。 */
  const sumPrices = (items: ReceiptItem[]) =>
    items.reduce((s, it) => s + (Number(it.price) || 0), 0);

  /**
   * 品目1件だけを書き換え、items 配列を丸ごと onUpdate に渡す。
   * 値段を変えたときだけ total も品目合計に合わせる（名前だけの編集では total を触らない）。
   */
  const updateItem = (index: number, patch: Partial<ReceiptItem>) => {
    const items = receipt.items.map((it, i) =>
      i === index ? { ...it, ...patch } : it,
    );
    onUpdate(
      receipt.id,
      "price" in patch ? { items, total: sumPrices(items) } : { items },
    );
  };

  /** 空の品目を末尾に追加（値段は0なので合計は変わらない）。 */
  const addItem = () => {
    onUpdate(receipt.id, { items: [...receipt.items, { name: "", price: 0 }] });
  };

  /** 品目を1件削除し、total を残りの品目合計に合わせる。 */
  const deleteItem = (index: number) => {
    const items = receipt.items.filter((_, i) => i !== index);
    onUpdate(receipt.id, { items, total: sumPrices(items) });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {editing ? (
            <input
              className="w-full rounded border border-gray-300 px-2 py-1 text-lg font-semibold dark:border-gray-700 dark:bg-gray-800"
              value={receipt.store}
              onChange={(e) => onUpdate(receipt.id, { store: e.target.value })}
            />
          ) : (
            <h3 className="truncate text-lg font-semibold">
              {receipt.store || "（店名不明）"}
            </h3>
          )}
          <p className="text-sm text-gray-500">
            {editing ? (
              <input
                type="date"
                className="rounded border border-gray-300 px-1 dark:border-gray-700 dark:bg-gray-800"
                value={receipt.date}
                onChange={(e) => onUpdate(receipt.id, { date: e.target.value })}
              />
            ) : (
              receipt.date
            )}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ backgroundColor: CATEGORY_COLORS[receipt.category] }}
        >
          {editing ? (
            <select
              className="bg-transparent outline-none"
              value={receipt.category}
              onChange={(e) =>
                onUpdate(receipt.id, { category: e.target.value as Category })
              }
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="text-black">
                  {c}
                </option>
              ))}
            </select>
          ) : (
            receipt.category
          )}
        </span>
      </div>

      {lowConfidence && (
        <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          ⚠ 要確認（自信度 {Math.round(receipt.confidence * 100)}%）
        </p>
      )}

      {(editing || receipt.items.length > 0) && (
        <div className="mt-3">
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {receipt.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                {editing ? (
                  <>
                    <input
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
                      value={item.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                    />
                    <input
                      type="number"
                      className="w-24 shrink-0 rounded border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-gray-700 dark:bg-gray-800"
                      value={item.price}
                      onChange={(e) =>
                        updateItem(i, { price: Number(e.target.value) })
                      }
                    />
                    <button
                      className="shrink-0 px-1 text-red-600 hover:text-red-800 dark:text-red-400"
                      aria-label="この品目を削除"
                      onClick={() => deleteItem(i)}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums">
                      {yen(item.price)}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {editing && (
            <button
              className="mt-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
              onClick={addItem}
            >
              ＋ 品目を追加
            </button>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800">
        <span className="text-sm text-gray-500">合計</span>
        {editing ? (
          <input
            type="number"
            className="w-28 rounded border border-gray-300 px-2 py-1 text-right font-bold dark:border-gray-700 dark:bg-gray-800"
            value={receipt.total}
            onChange={(e) =>
              onUpdate(receipt.id, { total: Number(e.target.value) })
            }
          />
        ) : (
          <span className="text-xl font-bold tabular-nums">{yen(receipt.total)}</span>
        )}
      </div>

      <div className="mt-3 flex justify-end gap-3 text-sm">
        <button
          className="text-blue-600 hover:underline dark:text-blue-400"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "完了" : "編集"}
        </button>
        <button
          className="text-red-600 hover:underline dark:text-red-400"
          onClick={() => onDelete(receipt.id)}
        >
          削除
        </button>
      </div>
    </div>
  );
}

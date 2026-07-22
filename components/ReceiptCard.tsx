"use client";

import { useState } from "react";
import type { ReceiptItem, StoredReceipt } from "@/lib/schema";
import {
  categoryColor,
  yen,
  LOW_CONFIDENCE_THRESHOLD,
  TOTAL_MISMATCH_THRESHOLD,
  sumItemPrices,
  dominantCategory,
  SOURCE_LABELS,
} from "@/lib/format";

type Props = {
  receipt: StoredReceipt;
  categories: string[];
  onUpdate: (id: string, patch: Partial<StoredReceipt>) => void;
  onDelete: (id: string) => void;
  /** true なら最初から編集モードで開く（手入力で追加した直後のカード用）。 */
  defaultEditing?: boolean;
  /** 「完了」で編集を閉じたときに呼ぶ（空カードの破棄判定は親に委譲）。 */
  onFinishEditing?: (id: string) => void;
};

/** 1件の支出レコード。要確認バッジ・手修正・削除に対応。 */
export default function ReceiptCard({
  receipt,
  categories,
  onUpdate,
  onDelete,
  defaultEditing,
  onFinishEditing,
}: Props) {
  const [editing, setEditing] = useState(defaultEditing ?? false);
  const lowConfidence = receipt.confidence < LOW_CONFIDENCE_THRESHOLD;
  // レシート見出しのバッジ：品目カテゴリのうち最も支出が多いものを表示（派生値）。
  const headlineCategory = dominantCategory(receipt.items);

  // 合計と品目内訳のズレ（正: 合計の方が大きい＝読み取り漏れの可能性）。
  const totalGap = receipt.total - sumItemPrices(receipt.items);
  const totalMismatch = Math.abs(totalGap) >= TOTAL_MISMATCH_THRESHOLD;

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
      "price" in patch ? { items, total: sumItemPrices(items) } : { items },
    );
  };

  /** 空の品目を末尾に追加（値段は0なので合計は変わらない。カテゴリは「その他」で開始）。 */
  const addItem = () => {
    onUpdate(receipt.id, {
      items: [...receipt.items, { name: "", price: 0, category: "その他" }],
    });
  };

  /** 品目を1件削除し、total を残りの品目合計に合わせる。 */
  const deleteItem = (index: number) => {
    const items = receipt.items.filter((_, i) => i !== index);
    onUpdate(receipt.id, { items, total: sumItemPrices(items) });
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
          <p className="flex items-center gap-2 text-sm text-gray-500">
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
            {/* AI抽出以外のレコードは入力経路を小さく示す */}
            {receipt.source !== "receipt" && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {SOURCE_LABELS[receipt.source]}
              </span>
            )}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-white"
          style={{ backgroundColor: categoryColor(headlineCategory) }}
          title="このレシートで最も支出が多いカテゴリ（品目から自動判定）"
        >
          {headlineCategory}
        </span>
      </div>

      {(lowConfidence || totalMismatch) && (
      <div className="mt-2 flex flex-wrap gap-2">
        {lowConfidence && (
          <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            ⚠ 要確認（自信度 {Math.round(receipt.confidence * 100)}%）
          </span>
        )}
        {totalMismatch && (
          <span
            className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            title="合計と品目価格の内訳が一致しません。読み取り漏れや値引きの取りこぼしがないか確認してください。"
          >
            ⚠ 内訳と合計が {yen(Math.abs(totalGap))} ずれています
          </span>
        )}
      </div>
      )}

      {(editing || receipt.items.length > 0) && (
        <div className="mt-3">
          <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {receipt.items.map((item, i) => (
              <li
                key={i}
                className={
                  editing
                    ? "flex flex-wrap items-center gap-2"
                    : "flex items-center justify-between gap-2"
                }
              >
                {editing ? (
                  <>
                    <input
                      className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
                      value={item.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                    />
                    <select
                      className="shrink-0 rounded border border-gray-300 px-1 py-1 dark:border-gray-700 dark:bg-gray-800"
                      value={item.category}
                      onChange={(e) =>
                        updateItem(i, { category: e.target.value })
                      }
                    >
                      {/* 現在のカテゴリ一覧に無い値（旧データ等）でも選択状態を保てるよう先頭に補う */}
                      {(categories.includes(item.category)
                        ? categories
                        : [item.category, ...categories]
                      ).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
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
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: categoryColor(item.category) }}
                    >
                      {item.category}
                    </span>
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
          onClick={() => {
            setEditing((v) => !v);
            if (editing) onFinishEditing?.(receipt.id);
          }}
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

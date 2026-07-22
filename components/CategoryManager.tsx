"use client";

import { useState } from "react";
import { FALLBACK_CATEGORY } from "@/lib/schema";
import { categoryColor } from "@/lib/format";

type Props = {
  categories: string[];
  /** カテゴリ名 → そのカテゴリを使っている品目数（削除確認・使用中表示に使う） */
  usage: Record<string, number>;
  onAdd: (name: string) => void;
  onDelete: (name: string) => void;
};

/** カテゴリの追加・削除 UI。設定的な位置づけなので折りたたみ（details）で表示する。 */
export default function CategoryManager({
  categories,
  usage,
  onAdd,
  onDelete,
}: Props) {
  const [input, setInput] = useState("");

  const trimmed = input.trim();
  const duplicate = categories.includes(trimmed);
  const tooLong = trimmed.length > 12;
  const canAdd = trimmed.length > 0 && !duplicate && !tooLong;

  function handleAdd() {
    if (!canAdd) return;
    onAdd(trimmed);
    setInput("");
  }

  function handleDelete(name: string) {
    const count = usage[name] ?? 0;
    if (
      count > 0 &&
      !window.confirm(
        `「${name}」を使っている ${count} 件の品目を「${FALLBACK_CATEGORY}」に移して削除します。よろしいですか？`,
      )
    ) {
      return;
    }
    onDelete(name);
  }

  return (
    <details className="mt-8 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
        ⚙ カテゴリを管理
      </summary>

      <ul className="mt-3 space-y-1.5">
        {categories.map((c) => {
          const count = usage[c] ?? 0;
          const protectedCat = c === FALLBACK_CATEGORY;
          return (
            <li key={c} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: categoryColor(c) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                {c}
              </span>
              <span className="shrink-0 text-xs text-gray-400">
                {count > 0 ? `${count}件で使用中` : "未使用"}
              </span>
              {protectedCat ? (
                <span
                  className="shrink-0 text-xs text-gray-400"
                  title="フォールバック用のため削除できません"
                >
                  🔒
                </span>
              ) : (
                <button
                  onClick={() => handleDelete(c)}
                  aria-label={`カテゴリ「${c}」を削除`}
                  className="shrink-0 px-1 text-red-600 hover:text-red-800 dark:text-red-400"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="新しいカテゴリ名"
          maxLength={12}
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          onClick={handleAdd}
          disabled={!canAdd}
          className="shrink-0 rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          追加
        </button>
      </div>
      {duplicate && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          「{trimmed}」は既にあります。
        </p>
      )}
      {tooLong && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          カテゴリ名は12文字までにしてください。
        </p>
      )}
    </details>
  );
}

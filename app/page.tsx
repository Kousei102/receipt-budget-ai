"use client";

import { useEffect, useMemo, useState } from "react";
import UploadDropzone from "@/components/UploadDropzone";
import ReceiptCard from "@/components/ReceiptCard";
import SummaryCharts from "@/components/SummaryCharts";
import type { Receipt, StoredReceipt } from "@/lib/schema";
import { loadReceipts, newId, saveReceipts } from "@/lib/storage";
import { formatMonthLabel } from "@/lib/format";
import { receiptsToCsv } from "@/lib/csv";

/** File を { base64, mediaType } に変換する（Claude に渡す形）。 */
function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string; // "data:image/png;base64,XXXX"
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

export default function Home() {
  const [receipts, setReceipts] = useState<StoredReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 複数枚アップロード時の進捗（N枚中M枚目）。1枚だけのときは null のまま。
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // 月次フィルタ。"all" は全期間。値は購入日から作った "YYYY-MM"。
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // レシートの購入日から、選択できる月の一覧（新しい順）を作る。
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of receipts) {
      const ym = r.date?.slice(0, 7);
      if (ym && /^\d{4}-\d{2}$/.test(ym)) set.add(ym);
    }
    return Array.from(set).sort().reverse();
  }, [receipts]);

  // 選択中の月が（削除などで）無くなったら全期間にフォールバックする。
  const effectiveMonth =
    selectedMonth !== "all" && !months.includes(selectedMonth)
      ? "all"
      : selectedMonth;

  // グラフと一覧の両方をこの絞り込み結果で表示する。
  const visibleReceipts = useMemo(
    () =>
      effectiveMonth === "all"
        ? receipts
        : receipts.filter((r) => r.date?.startsWith(effectiveMonth)),
    [receipts, effectiveMonth],
  );

  // 初回マウント時に localStorage から復元する。
  // localStorage はクライアント専用のため、SSR 後にこの1回だけ読み込む意図的なパターン。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceipts(loadReceipts());
  }, []);

  function persist(next: StoredReceipt[]) {
    // 画面表示は先に更新し、保存に失敗したときだけエラーを知らせる（操作は失われない）。
    setReceipts(next);
    try {
      saveReceipts(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データの保存に失敗しました。");
    }
  }

  /** 1枚を抽出して StoredReceipt を返す（失敗は投げる）。 */
  async function extractOne(file: File): Promise<StoredReceipt> {
    const { base64, mediaType } = await fileToBase64(file);
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mediaType }),
    });
    const data: { ok: boolean; receipt?: Receipt; error?: string } = await res.json();
    if (!data.ok || !data.receipt) {
      throw new Error(data.error ?? "レシートを読み取れませんでした。");
    }
    return { ...data.receipt, id: newId(), createdAt: new Date().toISOString() };
  }

  /**
   * 複数枚を順次処理する（API へ同時多発させない）。
   * 1枚終わるごとに保存して画面に反映し、失敗したファイルは名前付きでまとめて知らせる。
   */
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setLoading(true);
    setProgress(files.length > 1 ? { done: 0, total: files.length } : null);

    const base = receipts; // 処理中は他の変更が入らないため、開始時点の一覧を土台にする
    const added: StoredReceipt[] = [];
    const errors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const stored = await extractOne(files[i]);
        added.unshift(stored); // 新しく読んだものを先頭に
        persist([...added, ...base]); // 逐次反映（終わったものから表示）
      } catch (e) {
        errors.push(`${files[i].name}: ${e instanceof Error ? e.message : "読み取りに失敗"}`);
      }
      if (files.length > 1) setProgress({ done: i + 1, total: files.length });
    }

    if (errors.length > 0) {
      setError(
        `${files.length}枚中 ${errors.length}枚の読み取りに失敗しました。\n` +
          errors.join("\n"),
      );
    }
    setLoading(false);
    setProgress(null);
  }

  function handleUpdate(id: string, patch: Partial<StoredReceipt>) {
    persist(receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  /** 表示中（月フィルタ適用後）のレシートを CSV でダウンロードする。 */
  function handleExport() {
    // Excel(日本語)で文字化けしないよう先頭に BOM を付ける。
    const blob = new Blob(["\uFEFF" + receiptsToCsv(visibleReceipts)], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipts_${effectiveMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDelete(id: string) {
    persist(receipts.filter((r) => r.id !== id));
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">レシート家計簿AI 🧾</h1>
        <p className="mt-1 text-sm text-gray-500">
          レシート画像を Claude が読み取り、支出を自動でカテゴリ集計します。
        </p>
      </header>

      <UploadDropzone onFiles={handleFiles} disabled={loading} />

      {progress && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {progress.total}枚中 {progress.done}枚を処理しました…
        </p>
      )}

      {error && (
        <p className="mt-4 whitespace-pre-line rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {visibleReceipts.length > 0 && (
        <div className="mt-8 flex items-center justify-between gap-2">
          <button
            onClick={handleExport}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ⬇ CSVエクスポート
          </button>
          {months.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="month-filter" className="text-sm text-gray-500">
                表示期間
              </label>
              <select
                id="month-filter"
                value={effectiveMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <option value="all">すべての期間</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {visibleReceipts.length > 0 && (
        <section className="mt-4">
          <SummaryCharts receipts={visibleReceipts} />
        </section>
      )}

      <section className="mt-8">
        {receipts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
            まだレシートがありません。上の枠に画像をアップロードして始めましょう。
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleReceipts.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

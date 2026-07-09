"use client";

import { useEffect, useState } from "react";
import UploadDropzone from "@/components/UploadDropzone";
import ReceiptCard from "@/components/ReceiptCard";
import SummaryCharts from "@/components/SummaryCharts";
import type { Receipt, StoredReceipt } from "@/lib/schema";
import { loadReceipts, newId, saveReceipts } from "@/lib/storage";

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

  // 初回マウント時に localStorage から復元する。
  // localStorage はクライアント専用のため、SSR 後にこの1回だけ読み込む意図的なパターン。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReceipts(loadReceipts());
  }, []);

  function persist(next: StoredReceipt[]) {
    setReceipts(next);
    saveReceipts(next);
  }

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
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
      const stored: StoredReceipt = {
        ...data.receipt,
        id: newId(),
        createdAt: new Date().toISOString(),
      };
      persist([stored, ...receipts]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }

  function handleUpdate(id: string, patch: Partial<StoredReceipt>) {
    persist(receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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

      <UploadDropzone onFile={handleFile} disabled={loading} />

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {receipts.length > 0 && (
        <section className="mt-8">
          <SummaryCharts receipts={receipts} />
        </section>
      )}

      <section className="mt-8">
        {receipts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
            まだレシートがありません。上の枠に画像をアップロードして始めましょう。
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {receipts.map((r) => (
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

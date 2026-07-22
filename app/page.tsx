"use client";

import { useEffect, useMemo, useState } from "react";
import UploadDropzone from "@/components/UploadDropzone";
import ReceiptCard from "@/components/ReceiptCard";
import SummaryCharts from "@/components/SummaryCharts";
import CategoryManager from "@/components/CategoryManager";
import RecurringManager from "@/components/RecurringManager";
import {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  type Receipt,
  type ReceiptSource,
  type StoredReceipt,
} from "@/lib/schema";
import {
  loadReceipts,
  loadCategories,
  loadRecurring,
  newId,
  saveCategories,
  saveReceipts,
  saveRecurring,
} from "@/lib/storage";
import { materializeRecurring, type RecurringExpense } from "@/lib/recurring";
import { formatMonthLabel, isEmptyReceipt, yen } from "@/lib/format";
import { receiptsToCsv } from "@/lib/csv";
import { findDuplicate, findLooseCrossSourceDuplicate } from "@/lib/duplicate";

/** File を { base64, mediaType } に変換する（Claude に渡す形）。リサイズできないときのフォールバック。 */
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

// Claude Vision が最適にトークン計算する長辺の目安。これ以上は縮小しても精度に影響しにくい。
const MAX_IMAGE_EDGE = 1568;

/**
 * 送信前に画像を長辺 MAX_IMAGE_EDGE まで縮小し、JPEG(0.85) で再エンコードする。
 * 目的: 送信量とレイテンシ・API コストの削減、サーバー側サイズ上限(5MB)超過の予防。
 * canvas 変換に失敗した場合は元ファイルをそのまま送る（フォールバック）。
 */
async function fileToPayload(
  file: File,
): Promise<{ base64: string; mediaType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d コンテキストを取得できませんでした。");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "";
    if (!base64) throw new Error("画像の再エンコードに失敗しました。");
    return { base64, mediaType: "image/jpeg" };
  } catch {
    return fileToBase64(file);
  }
}

/** 重複と判定され保存を見送った候補（ユーザーが手動で「追加する」まで持っておく）。 */
type PendingDuplicate = { fileName: string; stored: StoredReceipt };

/**
 * 今日の日付をローカルタイムで "YYYY-MM-DD" にする。
 * toISOString() は UTC 基準のため、日本時間の深夜に日付がずれる。
 */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function Home() {
  const [receipts, setReceipts] = useState<StoredReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 複数枚アップロード時の進捗（N枚中M枚目）。1枚だけのときは null のまま。
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // 既存レシートと重複と判定され、保存を見送った候補（ユーザーが「追加する」/「✕」で解決するまで残る）。
  const [pendingDuplicates, setPendingDuplicates] = useState<PendingDuplicate[]>([]);
  // 月次フィルタ。"all" は全期間。値は購入日から作った "YYYY-MM"。
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  // ユーザー編集可能なカテゴリ一覧（初期値は既定。マウント後に localStorage から復元）。
  const [categories, setCategories] = useState<string[]>([...DEFAULT_CATEGORIES]);
  // 「＋手入力」で追加した直後のカードの id。このカードだけ編集モードで開く。
  const [newManualId, setNewManualId] = useState<string | null>(null);
  // 定期支出の定義一覧（家賃・サブスク等）。ロード時に未計上の月ぶんを自動計上する。
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);

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

  // カテゴリごとの使用品目数（カテゴリ管理での「使用中」表示・削除確認に使う）。
  const categoryUsage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of receipts) {
      for (const it of r.items) {
        counts[it.category] = (counts[it.category] ?? 0) + 1;
      }
    }
    return counts;
  }, [receipts]);

  // 初回マウント時に localStorage から復元し、定期支出の未計上分を自動計上する。
  // localStorage はクライアント専用のため、SSR 後にこの1回だけ読み込む意図的なパターン。
  useEffect(() => {
    const loaded = loadReceipts();
    const { defs, created } = materializeRecurring(
      loadRecurring(),
      loaded,
      todayLocal().slice(0, 7),
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCategories(loadCategories());
    setRecurring(defs);
    if (created.length > 0) {
      const next = [...created, ...loaded];
      setReceipts(next);
      try {
        // レコードの保存に成功してからカーソル（lastPostedMonth）を保存する。
        // 逆順だと保存失敗時にカーソルだけ進み、その月の計上が永久に欠落する。
        saveReceipts(next);
        saveRecurring(defs);
      } catch (e) {
        setError(e instanceof Error ? e.message : "データの保存に失敗しました。");
      }
    } else {
      setReceipts(loaded);
    }
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

  function persistCategories(next: string[]) {
    setCategories(next);
    try {
      saveCategories(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "カテゴリの保存に失敗しました。");
    }
  }

  function persistRecurring(next: RecurringExpense[]) {
    setRecurring(next);
    try {
      saveRecurring(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "定期支出の保存に失敗しました。");
    }
  }

  /**
   * 1枚の画像を抽出して StoredReceipt の配列を返す（失敗は投げる）。
   * 紙のレシートは1件、決済アプリの履歴画面は取引ごとに複数件返る。
   */
  async function extractFromFile(file: File): Promise<StoredReceipt[]> {
    const { base64, mediaType } = await fileToPayload(file);
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mediaType, categories }),
    });
    const data: {
      ok: boolean;
      receipts?: Receipt[];
      imageKind?: string;
      error?: string;
    } = await res.json();
    if (!data.ok || !data.receipts || data.receipts.length === 0) {
      throw new Error(data.error ?? "画像から支出を読み取れませんでした。");
    }
    const createdAt = new Date().toISOString();
    // クレカ明細由来だけ "card" にする（緩い重複判定の対象を区別するため）。
    // 決済アプリ（payment_app）は従来どおり "receipt" 扱い。
    const source: ReceiptSource = data.imageKind === "card_statement" ? "card" : "receipt";
    return data.receipts.map((r) => ({
      ...r,
      id: newId(),
      createdAt,
      source,
    }));
  }

  /** 空の手入力カードを先頭に追加し、編集モードで開く。 */
  function handleAddManual() {
    const today = todayLocal();
    const stored: StoredReceipt = {
      id: newId(),
      createdAt: new Date().toISOString(),
      source: "manual",
      store: "",
      date: today,
      total: 0,
      confidence: 1, // 人間の入力なので要確認バッジは不要
      items: [{ name: "", price: 0, category: FALLBACK_CATEGORY }],
    };
    persist([stored, ...receipts]);
    setNewManualId(stored.id);
    // 過去の月でフィルタ中だと追加したカードが見えないため、当月表示に切り替える。
    if (effectiveMonth !== "all" && !today.startsWith(effectiveMonth)) {
      setSelectedMonth(today.slice(0, 7));
    }
  }

  /** カードの「完了」押下時。手入力カードが空のままなら破棄する（キャンセル扱い）。 */
  function handleFinishEditing(id: string) {
    if (id === newManualId) setNewManualId(null);
    const r = receipts.find((x) => x.id === id);
    if (r && r.source === "manual" && isEmptyReceipt(r)) {
      handleDelete(id);
    }
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
    const newPendingDuplicates: PendingDuplicate[] = [];

    for (let i = 0; i < files.length; i++) {
      try {
        const extracted = await extractFromFile(files[i]);
        // base（既存）と added（先に処理した画像・バッチの分）の両方と照合する。
        // ただし同一画像内のレコード同士は照合しない：決済アプリの履歴は品目が無く
        // 店名・日付・合計の3点キーが衝突しやすいが、モデルが別行として返した以上
        // 別取引と信頼する（同じ店で同日に同額を2回払うのは正当な連続取引）。
        // 厳密一致を先に評価し、外れたら「カード明細 vs それ以外」限定の緩い一致で
        // 二重計上（店頭レシート＋カード明細）の候補を拾う。
        const accepted: StoredReceipt[] = [];
        for (let k = 0; k < extracted.length; k++) {
          const stored = extracted[k];
          const dupe =
            findDuplicate(stored, base) ??
            findDuplicate(stored, added) ??
            findLooseCrossSourceDuplicate(stored, base) ??
            findLooseCrossSourceDuplicate(stored, added);
          if (dupe) {
            const label =
              extracted.length > 1
                ? `${files[i].name} (${k + 1}/${extracted.length}件目)`
                : files[i].name;
            newPendingDuplicates.push({ fileName: label, stored });
          } else {
            accepted.push(stored);
          }
        }
        if (accepted.length > 0) {
          added.unshift(...accepted); // 新しく読んだものを先頭に
          persist([...added, ...base]); // 画像単位で反映（終わったものから表示）
        }
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
    if (newPendingDuplicates.length > 0) {
      // 前のバッチで未解決のものが残っていれば、それに追記する。
      setPendingDuplicates((prev) => [...newPendingDuplicates, ...prev]);
    }
    setLoading(false);
    setProgress(null);
  }

  function handleUpdate(id: string, patch: Partial<StoredReceipt>) {
    persist(receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  /** 重複と判定された候補を、ユーザーの意思で保存する（誤検知のリカバリ手段）。 */
  function handleForceAddDuplicate(id: string) {
    const pending = pendingDuplicates.find((p) => p.stored.id === id);
    if (!pending) return;
    persist([pending.stored, ...receipts]);
    setPendingDuplicates((prev) => prev.filter((p) => p.stored.id !== id));
  }

  /** 重複候補を保存せずに一覧から取り下げる。 */
  function handleDismissDuplicate(id: string) {
    setPendingDuplicates((prev) => prev.filter((p) => p.stored.id !== id));
  }

  /** カテゴリを1つ追加する（空・重複・過長は無視。バリデーションは呼び出し側でも実施）。 */
  function handleAddCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 12 || categories.includes(trimmed)) return;
    persistCategories([...categories, trimmed]);
  }

  /**
   * カテゴリを削除する。フォールバック（その他）は削除不可。
   * 使用中の品目は「その他」に付け替えてから一覧から除く（合計は品目価格を変えないので不変）。
   */
  function handleDeleteCategory(name: string) {
    if (name === FALLBACK_CATEGORY || !categories.includes(name)) return;
    const remapped = receipts.map((r) => {
      if (!r.items.some((it) => it.category === name)) return r;
      return {
        ...r,
        items: r.items.map((it) =>
          it.category === name ? { ...it, category: FALLBACK_CATEGORY } : it,
        ),
      };
    });
    persist(remapped);
    persistCategories(categories.filter((c) => c !== name));
    // 定期支出の定義も付け替える（放置すると削除済みカテゴリで計上され続ける）。
    if (recurring.some((d) => d.category === name)) {
      persistRecurring(
        recurring.map((d) =>
          d.category === name ? { ...d, category: FALLBACK_CATEGORY } : d,
        ),
      );
    }
  }

  /** 定期支出の定義を追加し、開始月から当月までの未計上分をその場で計上する。 */
  function handleAddRecurring(
    input: Omit<RecurringExpense, "id" | "createdAt" | "lastPostedMonth">,
  ) {
    const def: RecurringExpense = {
      ...input,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    const { defs, created } = materializeRecurring(
      [def],
      receipts,
      todayLocal().slice(0, 7),
    );
    const nextDefs = [...recurring, ...defs];
    const nextReceipts = [...created, ...receipts];
    setReceipts(nextReceipts);
    setRecurring(nextDefs);
    try {
      // マウント時と同じく、レコードの保存に成功してからカーソルを保存する。
      saveReceipts(nextReceipts);
      saveRecurring(nextDefs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データの保存に失敗しました。");
    }
  }

  /**
   * 定期支出の定義を変更する。今後の自動計上分にのみ反映され、計上済みレコードは触らない。
   * 変更後の定義で即 materialize し直す（未来開始だった定義を当月に前倒しした場合などに
   * その場で計上される。lastPostedMonth が主ガードなので二重計上はしない）。
   */
  function handleUpdateRecurring(
    id: string,
    patch: Omit<RecurringExpense, "id" | "createdAt" | "lastPostedMonth">,
  ) {
    const updated = recurring.map((d) => (d.id === id ? { ...d, ...patch } : d));
    const { defs, created } = materializeRecurring(
      updated,
      receipts,
      todayLocal().slice(0, 7),
    );
    if (created.length === 0) {
      persistRecurring(defs);
      return;
    }
    const nextReceipts = [...created, ...receipts];
    setReceipts(nextReceipts);
    setRecurring(defs);
    try {
      // マウント時・追加時と同じく、レコードの保存に成功してからカーソルを保存する。
      saveReceipts(nextReceipts);
      saveRecurring(defs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "データの保存に失敗しました。");
    }
  }

  /** 定期支出の定義を削除する。計上済みのレコードは残し、今後の自動計上だけ止める。 */
  function handleDeleteRecurring(id: string) {
    persistRecurring(recurring.filter((d) => d.id !== id));
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

      <div className="mt-3 text-center">
        <button
          onClick={handleAddManual}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ＋ 手入力で追加
        </button>
        <span className="ml-2 text-xs text-gray-400">
          レシートのない現金支出などはこちら
        </span>
      </div>

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

      {pendingDuplicates.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            既存のレシートと重複するため保存をスキップしました（{pendingDuplicates.length}件）
          </p>
          <ul className="mt-2 space-y-1">
            {pendingDuplicates.map((p) => (
              <li
                key={p.stored.id}
                className="flex items-center justify-between gap-2 text-amber-800 dark:text-amber-300"
              >
                <span className="min-w-0 truncate">
                  {p.fileName}: {p.stored.store || "（店名不明）"} {p.stored.date}{" "}
                  {yen(p.stored.total)}
                </span>
                <span className="flex shrink-0 gap-3">
                  <button
                    onClick={() => handleForceAddDuplicate(p.stored.id)}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    追加する
                  </button>
                  <button
                    onClick={() => handleDismissDuplicate(p.stored.id)}
                    aria-label="この重複候補を無視"
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
            まだ支出の記録がありません。上の枠に画像をアップロードするか、「＋ 手入力で追加」から始めましょう。
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleReceipts.map((r) => (
              <ReceiptCard
                key={r.id}
                receipt={r}
                categories={categories}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                defaultEditing={r.id === newManualId}
                onFinishEditing={handleFinishEditing}
              />
            ))}
          </div>
        )}
      </section>

      <RecurringManager
        defs={recurring}
        categories={categories}
        onAdd={handleAddRecurring}
        onUpdate={handleUpdateRecurring}
        onDelete={handleDeleteRecurring}
      />

      <CategoryManager
        categories={categories}
        usage={categoryUsage}
        onAdd={handleAddCategory}
        onDelete={handleDeleteCategory}
      />
    </main>
  );
}

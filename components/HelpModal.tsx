"use client";

import { useEffect, useRef } from "react";

type Props = {
  /** true になったら一度だけ自動でモーダルを開く（データ0件の初回ユーザー向け）。 */
  autoOpen: boolean;
};

/** Q&A 1組。文言だけの繰り返しなので小さなローカルコンポーネントに切り出す。 */
function QA({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <dt className="font-medium text-gray-700 dark:text-gray-300">{q}</dt>
      <dd className="mt-0.5 text-gray-600 dark:text-gray-400">{a}</dd>
    </div>
  );
}

/**
 * ヘッダー右の「？ 使い方」小ボタンと、その説明モーダル（ネイティブ dialog）。
 * Esc はネイティブで閉じる。autoOpen は false→true の一度きりの遷移を想定しており、
 * 初回ユーザーが閉じたあとに勝手に再表示されることはない。
 */
export default function HelpModal({ autoOpen }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (autoOpen) dialogRef.current?.showModal();
  }, [autoOpen]);

  return (
    <>
      <button
        onClick={() => dialogRef.current?.showModal()}
        className="shrink-0 rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        ？ 使い方
      </button>

      <dialog
        ref={dialogRef}
        // dialog 自体は p-0 でコンテンツを内側 div に包み、背景（dialog 本体）を
        // クリックしたときだけ閉じる（コンテンツ上のクリックでは閉じない）。
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-xl border border-gray-200 bg-white p-0 text-sm text-gray-900 shadow-lg backdrop:bg-black/50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold">❓ このアプリの使い方</h2>
            <button
              onClick={() => dialogRef.current?.close()}
              aria-label="使い方を閉じる"
              className="shrink-0 px-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>

          <h3 className="mt-4 font-medium text-gray-700 dark:text-gray-300">
            はじめ方（3ステップ）
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-gray-600 dark:text-gray-400">
            <li>
              レシート・決済アプリ・カード明細の画像を画面上部の点線枠にドロップすると、AIが店名・金額・カテゴリを自動で読み取ります。
            </li>
            <li>読み取り結果を確認し、違っていたらカードの「編集」で直します。</li>
            <li>
              収入と貯蓄目標を設定すると「今月あと使える額」が表示されます。
            </li>
          </ol>

          <h3 className="mt-5 font-medium text-gray-700 dark:text-gray-300">
            よくある質問
          </h3>
          <dl className="mt-2 space-y-3">
            <QA
              q="どんな画像が読み取れる？"
              a="レシートのほか、PayPayなど決済アプリのスクショ、クレジットカード明細のスクショに対応。複数枚まとめてアップロードできます。カード明細は利用日ベースで1行ずつ記録されます。"
            />
            <QA
              q="AIの読み取りには何が必要？"
              a="「🔑 APIキー設定」から自分の Anthropic APIキー（console.anthropic.com で取得）を登録すると読み取れます。キーはこのブラウザにのみ保存され、読み取り時にだけサーバー経由で Anthropic に送られます。"
            />
            <QA
              q="レシートがない支出は？"
              a="「＋ 手入力で追加」から登録できます。現金での支払いなどに。"
            />
            <QA
              q="家賃やサブスクは毎月入力が必要？"
              a="「🔁 定期支出を管理」に登録すると、毎月自動で計上されます。定義を編集しても過去の計上分は変わらず、今後の分にのみ反映されます。"
            />
            <QA
              q="「今月あと使える額」とは？"
              a="今月の収入 − 貯蓄目標 − 今月の支出です。「💰 収入・貯蓄目標を管理」から設定でき、給与を定期収入にすると毎月自動で計上されます。"
            />
            <QA
              q="読み取りが間違っていたら？"
              a="各カードの「編集」で店名・日付・品目・金額を直せます。AIの自信が低い記録には「⚠ 要確認」バッジが付くので、そこを優先して確認してください。"
            />
            <QA
              q="同じ支出が二重に登録されない？"
              a="同じ内容の記録を検知すると、保存前に確認を表示します（カード明細とレシートの二重計上も検知）。登録するかどうかは自分で選べます。"
            />
            <QA
              q="カテゴリは変えられる？"
              a="「⚙ カテゴリを管理」で追加・削除できます。変更した一覧はその後のAI読み取りにも反映されます。"
            />
            <QA
              q="データを書き出せる？"
              a="「⬇ CSVエクスポート」で支出一覧をダウンロードできます。月フィルタで期間を絞ってから書き出すことも可能です。"
            />
          </dl>
        </div>
      </dialog>
    </>
  );
}

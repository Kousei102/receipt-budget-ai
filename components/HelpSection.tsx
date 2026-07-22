type Props = {
  /** true なら最初から開いた状態で表示する（データ0件の初回ユーザー向け）。 */
  defaultOpen: boolean;
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
 * アプリの使い方の説明。Manager 群と同じ折りたたみ（details）で常設する。
 * open は初期表示にだけ効かせたい（以後はユーザーの開閉に任せる）ため、
 * defaultOpen はロード完了後に一度だけ確定した値を渡すこと。prop が変化しない限り
 * React は DOM の open を上書きしないので、実質 uncontrolled として振る舞う。
 */
export default function HelpSection({ defaultOpen }: Props) {
  return (
    <details
      open={defaultOpen || undefined}
      className="mb-6 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900"
    >
      <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
        ❓ このアプリの使い方
      </summary>

      <h3 className="mt-4 font-medium text-gray-700 dark:text-gray-300">
        はじめ方（3ステップ）
      </h3>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-gray-600 dark:text-gray-400">
        <li>
          レシート・決済アプリ・カード明細の画像を下の枠にドロップすると、AIが店名・金額・カテゴリを自動で読み取ります。
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
    </details>
  );
}

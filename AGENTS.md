<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Nokori

レシート画像・決済アプリのスクショ・クレカ明細のスクショを Claude Vision で読み取り、店名・日付・品目・金額・カテゴリを構造化データとして抽出し、支出をカテゴリ別に集計・可視化する家計簿アプリ。手入力・定期支出（家賃・サブスクの自動計上）・収入の記録（給与等の定期収入含む）と「あと使える額」表示にも対応。ポートフォリオ作品。

- 本番URL: https://receipt-budget-ai.vercel.app/
- GitHub: https://github.com/Kousei102/receipt-budget-ai （デフォルトブランチは `master`）

## 技術スタック
Next.js 16 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / Recharts / Zod / `@anthropic-ai/sdk`（モデル: `claude-sonnet-5`）。データ保存は v1 ではブラウザの localStorage。

## コマンド
- `npm run dev` — 開発サーバー（http://localhost:3000）
- `npm run build` — 本番ビルド
- `npm run lint` — ESLint
- `npm run eval` — 抽出精度の評価（`eval/samples/` に画像＋`.expected.json` が必要）

## 主要ファイル
- `lib/schema.ts` — 抽出結果の Zod スキーマ ＋ Tool 用 JSON Schema ビルダー（`buildReceiptJsonSchema` / 配列ラッパー `buildExtractionJsonSchema`）＋ カテゴリ既定値（`DEFAULT_CATEGORIES` / `FALLBACK_CATEGORY`）＋ 入力経路 `ReceiptSource` ＋ 画像種別 `ImageKind`
- `lib/anthropic.ts` — Claude 呼び出し（`extractReceipts`、1画像から複数レコード）。**Tool Use + tool_choice で構造化出力を強制し、Zod で検証**する中核
- `app/api/extract/route.ts` — 画像を受けて抽出する API（Node ランタイム）。レスポンスは `{ ok, imageKind, receipts }`（`imageKind` でクライアントが `source` を切り替える）
- `lib/duplicate.ts` — 重複検知。厳密一致（`findDuplicate`：店名・日付・合計の3点一致）と、カード明細×レシートの二重計上向けの緩い一致（`findLooseCrossSourceDuplicate`）の二段構え
- `lib/storage.ts` — localStorage 読み書き（レシート＋カテゴリ一覧＋定期支出定義＋収入＋定期収入定義＋貯蓄目標＋ユーザーAPIキー `loadApiKey`/`saveApiKey`。将来 DB に差し替える場合はここだけ変える）
- `lib/recurring.ts` — 定期支出の定義型と自動計上ロジック（`materializeRecurring`、冪等）＋ 月列挙の共通ヘルパー（`enumerateMonthsToPost`、定期収入と共有）
- `lib/income.ts` — 収入レコード（`IncomeRecord`）と定期収入の定義型・自動計上（`materializeRecurringIncome`、冪等）
- `lib/balance.ts` — 収支サマリーの集計（`calcBalance`。あと使える額 = 収入 − 貯蓄目標 − 支出）
- `lib/format.ts` — 金額整形・カテゴリ色（`categoryColor`）・要確認しきい値・入力経路ラベル（`SOURCE_LABELS`）
- `components/` — UploadDropzone / ReceiptCard / SummaryCharts / CategoryManager / RecurringManager / IncomeManager / ApiKeySettings（BYOK設定） / HelpModal（使い方説明）
- `eval/run-eval.ts` — 精度評価スクリプト

## 設計上の約束・注意点
- APIキーは **BYOK優先＋envフォールバック**：ユーザーが「🔑 APIキー設定」（`components/ApiKeySettings.tsx`）で登録したキーを localStorage（`receipt-kakeibo:api-key`）に保存し、抽出時にヘッダー `x-anthropic-api-key` で毎回中継する。無ければサーバーの `ANTHROPIC_API_KEY` にフォールバック。**サーバーはユーザーのキーを保存・ログ出力しない**（`app/api/extract/route.ts` で受けて `extractReceipts` に渡すだけ）。キー皆無は早期401、キー無効（SDK の `AuthenticationError`/`PermissionDeniedError`）も401で日本語メッセージを返す。
- `ANTHROPIC_API_KEY` は `.env.local`（Git管理外）に置く。**eval の実行には必須**。UI はユーザーキーがあれば env 不要（本番で env を外せば実質BYOK専用にできる）。
- レスポンスは必ず `receiptSchema.safeParse` を通してから使う（壊れたJSONを弾く）。
- カテゴリは**実行時にユーザーが追加・削除できる**（実体は localStorage、`lib/storage.ts` の `loadCategories`/`saveCategories`）。`lib/schema.ts` の `DEFAULT_CATEGORIES` は初期シード兼フォールバックにすぎない。抽出時は現在の一覧を `/api/extract` に渡し、`buildReceiptJsonSchema` が Claude の tool `enum` を動的生成する。色は `lib/format.ts` の `categoryColor()` が任意名に自動割り当てするので、色マップの手更新は不要（既定6色だけ `DEFAULT_CATEGORY_COLORS` に固定）。`FALLBACK_CATEGORY`（その他）は削除不可の恒久カテゴリ。
- 保存するのは抽出後のJSONのみ。**画像は保存しない**。
- 支出レコード（`StoredReceipt`）は入力経路を `source`（`"receipt" | "manual" | "recurring" | "card"`）で区別する。集計・月フィルタ・CSVは `date` / `items[].category` / `items[].price` だけを見るので、この形に合えば入力経路を問わず既存の表示・集計がそのまま動く。手入力・定期支出は `confidence: 1`（要確認バッジを出さない）。
- クレカ明細の取り込みは**利用日ベース**（`date` に利用日。引き落とし日は扱わない）。明細由来は `source: "card"`。緩い重複判定（店名の NFKC 正規化＋部分一致・日付±3日・金額±1円）は**「card vs 非card」のペアに限定**して適用する — 全レコード間に広げると同店同額の正当な買い物を誤検知するため。重複候補の最終判断は常にユーザー（重複確認UI）。
- 定期支出の自動計上は**冪等**にする：定義側の `lastPostedMonth` カーソルが主ガード（計上済みレコードをユーザーが削除しても復活させない）。レコード保存に成功してからカーソルを保存する順序を崩さない。定義の編集は**今後の計上分にのみ反映**し、計上済みレコードは書き換えない。
- 収入（`IncomeRecord`）は**支出（`StoredReceipt`）と混ぜない**：集計・CSV・重複検知はすべて支出前提のため、別の型・別の localStorage キーで管理する（`lib/income.ts` / `lib/storage.ts` の `loadIncomes` 等）。入力経路は手入力と定期のみ（画像からのAI抽出は対象外）。CSV は引き続き**支出専用**（v1）。
- 定期収入（給与等）の冪等セマンティクスは**定期支出と同一**：`lastPostedMonth` カーソルが主ガード、レコード保存成功→カーソル保存の順序、定義の編集は今後の計上分のみ。当月分は給料日未到来でも計上する（定期支出と対称。「あと使える額」が月初から安定する）。月列挙ロジックは `lib/recurring.ts` の `enumerateMonthsToPost` を両者で共有する。
- 「あと使える額」= 今月の収入 − 貯蓄目標 − 今月の支出（`lib/balance.ts` の `calcBalance`）。支出は `items[].price` の合計を使い、円グラフの集計と必ず一致させる（`total` は使わない）。当月の定期支出はロード時に自動計上済みなので固定費の先取りは追加計算不要。「あと使える」という表現は**当月のみ**（過去月は「収支」、全期間は合計のみ）。貯蓄目標はグローバルな月額1つ（月別設定はしない）。収入も貯蓄目標も未設定なら収支サマリーは表示しない。
- 使い方説明（`components/HelpModal.tsx`）はヘッダー右の「？ 使い方」ボタンから開く**ネイティブ `<dialog>` モーダル**（`showModal()`。Esc・✕・背景クリックで閉じる。ライブラリ不使用）。**支出・収入とも0件（自動計上分含む）のロード完了時に一度だけ自動表示**する — 判定は localStorage の「表示済み」フラグではなくデータ0件チェック（`app/page.tsx` の `helpAutoOpen`。マウント時 useEffect で一度だけ確定させ、以後 prop を揺らさない）。説明文中のボタン名・絵文字（⚙🔁💰🔑⬇⚠ 等）は実UIの表記と一致させること — UI文言を変えたら HelpModal 側も追従する。

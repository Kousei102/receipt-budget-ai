<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# レシート家計簿AI

レシート画像を Claude Vision で読み取り、店名・日付・品目・金額・カテゴリを構造化データとして抽出し、支出をカテゴリ別に集計・可視化する家計簿アプリ。ポートフォリオ作品。

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
- `lib/schema.ts` — 抽出結果の Zod スキーマ ＋ Tool 用 JSON Schema ビルダー（`buildReceiptJsonSchema`）＋ カテゴリ既定値（`DEFAULT_CATEGORIES` / `FALLBACK_CATEGORY`）
- `lib/anthropic.ts` — Claude 呼び出し。**Tool Use + tool_choice で構造化出力を強制し、Zod で検証**する中核
- `app/api/extract/route.ts` — 画像を受けて抽出する API（Node ランタイム）
- `lib/storage.ts` — localStorage 読み書き（レシート＋カテゴリ一覧。将来 DB に差し替える場合はここだけ変える）
- `lib/format.ts` — 金額整形・カテゴリ色（`categoryColor`）・要確認しきい値
- `components/` — UploadDropzone / ReceiptCard / SummaryCharts / CategoryManager
- `eval/run-eval.ts` — 精度評価スクリプト

## 設計上の約束・注意点
- **APIキーはサーバー側のみ**で使う（`app/api/extract/route.ts`）。ブラウザに露出させない。
- `ANTHROPIC_API_KEY` は `.env.local`（Git管理外）に置く。抽出と eval の実行に必須。
- レスポンスは必ず `receiptSchema.safeParse` を通してから使う（壊れたJSONを弾く）。
- カテゴリは**実行時にユーザーが追加・削除できる**（実体は localStorage、`lib/storage.ts` の `loadCategories`/`saveCategories`）。`lib/schema.ts` の `DEFAULT_CATEGORIES` は初期シード兼フォールバックにすぎない。抽出時は現在の一覧を `/api/extract` に渡し、`buildReceiptJsonSchema` が Claude の tool `enum` を動的生成する。色は `lib/format.ts` の `categoryColor()` が任意名に自動割り当てするので、色マップの手更新は不要（既定6色だけ `DEFAULT_CATEGORY_COLORS` に固定）。`FALLBACK_CATEGORY`（その他）は削除不可の恒久カテゴリ。
- 保存するのは抽出後のJSONのみ。**画像は保存しない**。

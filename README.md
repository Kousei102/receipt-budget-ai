# レシート家計簿AI 🧾

レシート画像をアップロードすると、**Claude（Vision）** が中身を読み取り、店名・日付・品目・金額・カテゴリを**構造化データ**として抽出。支出を自動でカテゴリ別に集計・可視化する家計簿アプリです。

「家計簿は入力が面倒で続かない」という身近な課題を、画像を撮るだけで解決します。

> **デモ**: （Vercel にデプロイ後、URL をここに貼る）
> **スクリーンショット**: （`docs/` に画像を置いてここに貼る）

---

## この作品の技術的な見どころ（AIエンジニアリング）

単に「Claude API を呼ぶ」だけでなく、実務で問われる次の3点を意識して設計しています。

### 1. マルチモーダル入力
レシート画像を base64 でサーバーに送り、Claude Vision に渡して読み取らせます（[`lib/anthropic.ts`](lib/anthropic.ts)）。

### 2. 構造化出力の堅牢な実装（Tool Use）
自由記述の文章ではなく、**必ず決まった形の JSON** を得るために **Tool Use（function calling）** を使っています。

```
JSON Schema を定義 → tool_choice でツール使用を強制 → 返ってきた JSON を Zod で検証
```

- モデル向けの契約: [`lib/schema.ts`](lib/schema.ts) の `receiptJsonSchema`（`description` を細かく書き、精度を上げる）
- 実データの検証: 同ファイルの `receiptSchema`（Zod）で `safeParse`。型と実データの整合を保証し、壊れたレスポンスは弾く

### 3. 評価（eval）の仕組み
手ラベル付きサンプルで抽出精度を測るスクリプトを同梱しています（[`eval/run-eval.ts`](eval/run-eval.ts)）。
「なんとなく動く」で終わらせず、**数字で精度を確認しながら**開発できます。

```
店名一致    : XX%
日付一致    : XX%
カテゴリ一致: XX%
合計一致    : XX%
品数一致    : XX%
```

さらに、モデルが返す `confidence`（自信度）が低いレシートには UI で「⚠ 要確認」を表示し、**AIの不確実性をユーザーに委ねる**設計にしています。

---

## 技術スタック

| 領域 | 使用技術 |
|---|---|
| フレームワーク | Next.js 16 (App Router) / React 19 / TypeScript |
| スタイル | Tailwind CSS v4 |
| グラフ | Recharts |
| AI | Claude (`claude-sonnet-5`) via `@anthropic-ai/sdk` |
| バリデーション | Zod |
| データ保存 | ブラウザ localStorage（v1） |

## アーキテクチャ

```
app/
  page.tsx               メイン画面（アップロード + ダッシュボード）
  api/extract/route.ts   画像を受け Claude を呼ぶ API（キーはサーバー側だけで使用）
lib/
  schema.ts              Zodスキーマ / JSON Schema / カテゴリ定義
  anthropic.ts           Claude 呼び出し（Tool Use による構造化抽出）
  storage.ts             localStorage 読み書き
  format.ts              金額整形・カテゴリ色
components/
  UploadDropzone.tsx     画像のドラッグ&ドロップ
  ReceiptCard.tsx        抽出結果の表示・手修正・削除
  SummaryCharts.tsx      カテゴリ別の円グラフ
eval/
  run-eval.ts            抽出精度の評価スクリプト
  samples/               評価用の画像＋正解データ
```

APIキーは `app/api/extract/route.ts`（サーバー側）でのみ使い、ブラウザには一切露出しません。

---

## セットアップ

```bash
# 1. 依存をインストール
npm install

# 2. APIキーを設定
cp .env.local.example .env.local
#   .env.local を開き、ANTHROPIC_API_KEY にキーを設定
#   キーは https://console.anthropic.com の「API Keys」で発行

# 3. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

## 精度の評価

```bash
# eval/samples/ に「画像 + <name>.expected.json」を置いてから:
npm run eval
```

詳しい置き方は [`eval/samples/README.md`](eval/samples/README.md) を参照。

## デプロイ（Vercel）

1. このリポジトリを GitHub に push
2. [Vercel](https://vercel.com) でインポート
3. 環境変数に `ANTHROPIC_API_KEY` を設定
4. Deploy → 公開 URL を README 冒頭に貼る

---

## 今後の展望（v2 アイデア）

- ユーザー認証＋DB永続化（Vercel Postgres など）で複数端末対応
- 月次・週次の支出推移グラフ、予算アラート
- CSV / 家計簿アプリへのエクスポート
- 品目レベルでのカテゴリ自動分類、レシート複数枚の一括アップロード

---

## ライセンス

MIT

# 改善ロードマップ

レシート家計簿AI の改善計画。優先度順（A → B → C）。完了したら `[x]` にチェックを入れる。

> 進め方: 各項目は独立して着手・PR 化できる粒度で書いている。上から順に進めるのが基本。

---

## A. ポートフォリオ価値に直結（最優先）

- [ ] **A-1. eval を実データで計測し、README に数値を載せる**
  - なぜ: アピール軸の「eval」に実測値がなく、仕組みだけが空回りしている。投資対効果が最大。
  - 何を: `eval/samples/` に実レシート画像＋`<name>.expected.json` を数枚置き、`npm run eval` を実行。出力（店名一致 / 日付一致 / カテゴリ一致 / 合計一致 / 品数一致）を README に転記する。
  - 完了条件: README に精度の実測値（例「カテゴリ一致 85%（5枚）」）が載っている。

- [ ] **A-2. README にスクリーンショット / GIF を追加**
  - なぜ: 採用担当は動かす前に見た目で判断する。
  - 何を: アップロード→抽出→円グラフの一連を撮影し、`docs/` に画像を置いて README から参照。

## B. 機能・UX

- [ ] **B-1. 合計と品目合計の不一致を警告**
  - なぜ: 現状「要確認」バッジは AI の `confidence` のみが根拠。`total` と品目 price 合計のズレは OCR ミスの強いシグナルなのに拾えていない。
  - 何を: `ReceiptCard` で `total` と `sumPrices(items)` の差が一定額以上なら警告バッジを出す。しきい値は `lib/format.ts` に定数化。

- [ ] **B-2. 月次フィルタ / 期間絞り込み**
  - なぜ: `SummaryCharts` が全レシートを合算しており、家計簿として「今月」を見られない。
  - 何を: 月（または期間）セレクタを追加し、集計対象を絞る。`createdAt` または `date` を基準にする。

- [ ] **B-3. CSV エクスポート**
  - なぜ: localStorage 完結でデータが外に出せない。実用感が上がる。
  - 何を: 保存済みレシートを CSV 文字列化してダウンロード。品目単位の行で出すと表計算で扱いやすい。

- [ ] **B-4. 複数枚アップロード**
  - なぜ: `UploadDropzone` が `files[0]` のみ処理。まとめて処理できると体験が良い。
  - 何を: 複数ファイルを順次 `/api/extract` にかけ、各件の進捗・成否を表示。

- [ ] **B-5. 送信前の画像リサイズ / 圧縮**
  - なぜ: スマホ写真は数MB → base64 でさらに膨張。レイテンシとコストが上がる。
  - 何を: client 側で canvas 等で長辺を縮小してから base64 化。

## C. コード堅牢性

- [x] **C-1. `saveReceipts` の例外処理**
  - なぜ: `loadReceipts` は try/catch 済みだが保存側は素通り。localStorage の容量超過やプライベートモードで throw し得る。
  - 何を: `lib/storage.ts` の `saveReceipts` を try/catch で囲み Error を投げ、`app/page.tsx` の `persist` で捕捉してエラー表示（メモリ上のデータは保持）。

- [x] **C-2. Zod の値域を厳格化**
  - なぜ: `price` / `total` が `z.number()` のみで NaN・負値・Infinity を通す。`date` も形式未検証。「壊れたJSONを弾く」約束が緩い。
  - 何を: `lib/schema.ts` で `price` に `.finite()`（値引き行を許すため負値は許容）、`total` に `.finite().nonnegative()`、`date` に `.regex(/^\d{4}-\d{2}-\d{2}$/)` を付与。Tool 用 JSON Schema にも `minimum`/`maximum` を追記。

- [x] **C-3. サーバー側の画像サイズ上限チェック**
  - なぜ: `/api/extract` が base64 長を無制限に受ける。DoS・課金事故のリスク。
  - 何を: デコード後 5MB 相当の上限（base64 文字数換算）を設け、超過は 413 で弾く。

---

## メモ
- カテゴリ追加時は `lib/schema.ts` の `CATEGORIES` が単一情報源。グラフ色は `lib/format.ts` の `CATEGORY_COLORS` を対で更新。
- コードを書く前に `node_modules/next/dist/docs/` の該当ガイドを確認する（この Next.js はバージョン差分あり）。
- v2 候補（本ロードマップ外・将来）: 認証＋DB永続化（複数端末対応）、月次推移グラフ。

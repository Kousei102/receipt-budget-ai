# 評価用サンプル

ここにレシート画像と、その「正解データ」を置くと `npm run eval` で抽出精度を測れます。

## 置き方

画像1枚につき、同じ名前の `.expected.json` をペアで置きます。

```
eval/samples/
  receipt1.jpg
  receipt1.expected.json
  receipt2.png
  receipt2.expected.json
```

`.expected.json` の形式（手で書く正解データ。`confidence` は不要）:

```json
{
  "store": "セブンイレブン◯◯店",
  "date": "2026-07-01",
  "items": [
    { "name": "おにぎり", "price": 150 },
    { "name": "お茶", "price": 130 }
  ],
  "total": 280,
  "category": "食費"
}
```

## 実行

```bash
npm run eval
```

各サンプルの項目別 ◯✗ と、全体の一致率（店名・日付・カテゴリ・合計・品数）が出力されます。
この数字を README のトップに載せると「精度を測りながら開発した」ことが伝わります。

> サンプル画像は個人情報を含むことがあるため、Git にコミットするかは各自で判断してください。
> コミットしたくない場合は `.gitignore` に `eval/samples/*.jpg` などを追加してください。

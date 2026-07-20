import { z } from "zod";

/**
 * 支出カテゴリ。UI のグラフ色分けと、モデルに渡す enum の両方でこの1か所を使う。
 */
export const CATEGORIES = [
  "食費",
  "日用品",
  "外食",
  "交通",
  "娯楽",
  "その他",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** レシート1品目 */
export const receiptItemSchema = z.object({
  name: z.string(),
  // NaN / Infinity は弾く。値引き行を品目として返す可能性を残すため負値は許容する。
  price: z.number().finite(),
  category: z.enum(CATEGORIES),
});

/**
 * Claude から受け取る「1枚のレシート」の構造。
 * ここが構造化出力の“契約”。API レスポンスは必ずこの形にパースする。
 * 型だけでなく値の妥当性（日付形式・金額が有限で非負）もここで担保し、壊れた出力を弾く。
 */
export const receiptSchema = z.object({
  store: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式である必要があります"),
  items: z.array(receiptItemSchema),
  // 実支払額。NaN / Infinity / 負値は異常なので弾く。
  total: z.number().finite().nonnegative(),
  confidence: z.number().min(0).max(1),
});

export type ReceiptItem = z.infer<typeof receiptItemSchema>;
export type Receipt = z.infer<typeof receiptSchema>;

/** localStorage に保存するときは id と作成日時を付与する */
export type StoredReceipt = Receipt & {
  id: string;
  createdAt: string; // ISO文字列
};

/**
 * Claude の Tool Use に渡す JSON Schema。
 * receiptSchema と対になっており、モデルにこの形での出力を強制する。
 * （Zod と二重管理になるが、モデル向けには description を細かく書きたいので手書きする）
 */
export const receiptJsonSchema = {
  type: "object",
  properties: {
    store: {
      type: "string",
      description: "店名。読み取れなければ空文字にする。",
    },
    date: {
      type: "string",
      description:
        "購入日を YYYY-MM-DD 形式で。年がレシートに無ければ文脈から推定し、無理なら今年とする。",
    },
    items: {
      type: "array",
      description: "購入した品目の一覧。",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "品目名" },
          price: { type: "number", description: "税込価格（円、整数または小数）" },
          category: {
            type: "string",
            enum: [...CATEGORIES],
            description:
              "この品目自体の支出カテゴリを1つ選ぶ。例: 食品→食費、飲食店での飲食→外食、洗剤・トイレットペーパー等→日用品、電車・バス→交通、書籍・ゲーム等→娯楽、どれにも当てはまらない→その他。",
          },
        },
        required: ["name", "price", "category"],
      },
    },
    total: {
      type: "number",
      minimum: 0,
      description: "合計金額（円）。値引き後の実支払額。0以上。",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description:
        "抽出全体への自信度 0〜1。ぼやけ・見切れ・レシート以外の画像など不確かなほど低くする。",
    },
  },
  required: ["store", "date", "items", "total", "confidence"],
} as const;

import { z } from "zod";

/**
 * 支出カテゴリの初期値（シード）。
 * カテゴリはユーザーが実行時に追加・削除でき、実体は localStorage に保存する
 * （`lib/storage.ts` の loadCategories/saveCategories）。ここはあくまで初期一覧と、
 * まだ保存が無いとき・壊れているときのフォールバック。
 */
export const DEFAULT_CATEGORIES = [
  "食費",
  "日用品",
  "外食",
  "交通",
  "娯楽",
  "その他",
] as const;

/** どのカテゴリにも当てはめられないときの受け皿。削除不可の恒久カテゴリ。 */
export const FALLBACK_CATEGORY = "その他";

// カテゴリは実行時に増減するため、固定ユニオンではなく文字列として扱う。
export type Category = string;

/** レシート1品目 */
export const receiptItemSchema = z.object({
  name: z.string(),
  // NaN / Infinity は弾く。値引き行を品目として返す可能性を残すため負値は許容する。
  price: z.number().finite(),
  // カテゴリは実行時に増減するので enum で固定できない。空でない文字列だけを要求し、
  // 「現在の一覧に属するか」はサーバー側（lib/anthropic.ts）で照合し外れ値をフォールバックに寄せる。
  category: z.string().min(1),
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

/**
 * 抽出元画像の種別。モデルが判定して imageKind として返す（1画像につき1種別）。
 * - "receipt": 紙のレシート
 * - "payment_app": 決済アプリ（PayPay 等）の取引履歴画面
 * - "card_statement": クレジットカードの利用明細（Web明細・カードアプリ画面）
 */
export const IMAGE_KINDS = ["receipt", "payment_app", "card_statement"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/**
 * レコードの入力経路。
 * - "receipt": 画像からのAI抽出（紙レシート・決済アプリのスクショ含む。挙動が同一なので区別しない）
 * - "manual": 手入力
 * - "recurring": 定期支出の自動計上
 * - "card": クレカ明細スクショからのAI抽出（緩い重複判定の対象を区別するため "receipt" と分ける）
 */
export type ReceiptSource = "receipt" | "manual" | "recurring" | "card";

/** localStorage に保存するときは id・作成日時・入力経路を付与する */
export type StoredReceipt = Receipt & {
  id: string;
  createdAt: string; // ISO文字列
  source: ReceiptSource;
  // 定期支出（source: "recurring"）の冪等タグ。どの定義のどの月分かを示す。
  recurringId?: string;
  recurringMonth?: string; // "YYYY-MM"
};

/**
 * Claude の Tool Use に渡す JSON Schema を、その時点のカテゴリ一覧から組み立てる。
 * receiptSchema と対になっており、モデルにこの形での出力を強制する。
 * category の enum は実行時のユーザー定義カテゴリで動的に差し替わる（追加分も自動分類の対象になる）。
 * （Zod と二重管理になるが、モデル向けには description を細かく書きたいので手書きする）
 */
export function buildReceiptJsonSchema(categories: readonly string[]) {
  return {
    type: "object",
    properties: {
      store: {
        type: "string",
        description:
          "店名または支払先（決済アプリの履歴では加盟店名）。読み取れなければ空文字にする。",
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
              enum: [...categories],
              description:
                "この品目自体の支出カテゴリを、上記 enum の中から1つ選ぶ。例: 食品→食費、飲食店での飲食→外食、洗剤・トイレットペーパー等→日用品、電車・バス→交通、書籍・ゲーム等→娯楽、どれにも当てはまらない→その他。",
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
          "このレコード単体への自信度 0〜1。ぼやけ・見切れ・支出の記録として解釈できない画像など不確かなほど低くする。",
      },
    },
    required: ["store", "date", "items", "total", "confidence"],
  } as const;
}

/**
 * Tool Use に渡す最上位の JSON Schema。1画像から複数の支出レコードを受け取れるよう
 * buildReceiptJsonSchema（1件分）を配列でラップする。
 * 紙のレシートは1件、決済アプリの履歴画面は取引ごとに1件ずつ返させる。
 */
export function buildExtractionJsonSchema(categories: readonly string[]) {
  return {
    type: "object",
    properties: {
      imageKind: {
        type: "string",
        enum: [...IMAGE_KINDS],
        description:
          "画像の種別。紙のレシート→receipt、決済アプリの取引履歴画面→payment_app、クレジットカードのWeb明細・カードアプリの利用明細→card_statement。",
      },
      receipts: {
        type: "array",
        minItems: 1,
        description:
          "画像から抽出した支出レコードの一覧。紙のレシートなら必ず1件だけ。決済アプリの取引履歴画面・クレカの利用明細なら、見えている取引（利用）1件につき1レコードにする。",
        items: buildReceiptJsonSchema(categories),
      },
    },
    required: ["imageKind", "receipts"],
  } as const;
}

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  receiptSchema,
  buildExtractionJsonSchema,
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  IMAGE_KINDS,
  type ImageKind,
  type Receipt,
} from "./schema";

/**
 * Vision 対応モデル。精度を上げたいときは "claude-opus-4-8" に差し替え可能。
 */
const MODEL = "claude-sonnet-5";
const TOOL_NAME = "record_receipts";

/** Claude が受け付ける画像 MIME タイプ */
export type SupportedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export const SUPPORTED_MEDIA_TYPES: SupportedMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

const SYSTEM = `あなたは支出の記録画像を読み取り、構造化する専門アシスタントです。
画像は次のいずれかです:
1. 紙のレシート → receipts に必ず1件だけ入れる。
2. 決済アプリ（PayPay 等）の取引履歴画面 → 画面に見えている支払い取引1件につき1レコードにする。store には支払先（加盟店名）を入れ、品目の内訳が見えない取引は items を「支払先名・金額・カテゴリ」の1品目だけにする。チャージ・受け取り等の支出でない行は含めない。
3. クレジットカードの利用明細（Web明細・カードアプリの画面） → 画面に見えている利用1件につき1レコードにする。
   - store には加盟店名を入れる。半角カタカナは全角に直し（例: ｲｵﾝﾘﾃｰﾙ → イオンリテール）、末尾の店舗番号等のノイズは省いてよい。
   - date には「利用日」を入れる（支払日・引落日ではない）。
   - 品目の内訳は無いので items は「加盟店名・金額・カテゴリ」の1品目だけにする。category は加盟店名から業種を推定して選ぶ（例: スーパー→食費、飲食店→外食、鉄道・タクシー→交通。判断できなければその他）。
   - 返金・キャンセル（マイナス額の行）、キャッシング・借入、前月繰越や支払合計などの利用でない行は含めない。年会費・手数料は実支出なので含める。

共通ルール:
- imageKind に画像の種別を必ず入れる（紙のレシート→receipt、決済アプリ→payment_app、クレカ明細→card_statement）。
- 金額は数値（円）で返す。通貨記号やカンマ、"円" の文字は含めない。
- 日付は YYYY-MM-DD 形式にする。数字以外（X 等）を含めてはならない。年が伏せ字（20XX 等）や欠落で読めない場合は、曜日などの文脈から推定し、無理なら今年とする。
- category は品目ごとに、その品目自体の用途に最も合うものを1つ選ぶ（同じレシート内でも品目ごとに異なってよい）。
- confidence はレコードごとに付け、読み取りに自信が持てないほど下げる。
- 見切れて金額や日付が読めない取引は含めない。
- 支出の記録として解釈できない画像でもエラーにせず、分かる範囲で1件埋め、confidence を 0.2 未満にする。`;

/** モデル出力の最上位形。buildExtractionJsonSchema と対になる検証スキーマ。 */
const extractionSchema = z.object({
  // 万一欠落・異常値でも抽出全体は落とさず "receipt" 扱いにする（防御）。
  imageKind: z.enum(IMAGE_KINDS).catch("receipt"),
  receipts: z.array(receiptSchema).min(1),
});

export type ExtractResult =
  | { ok: true; imageKind: ImageKind; receipts: Receipt[] }
  | { ok: false; error: string };

/**
 * APIキーを検証してクライアントを生成する（未設定なら分かりやすいエラー）。
 * BYOK: ユーザーが持ち込んだキーを優先し、無ければサーバーの環境変数にフォールバック。
 */
export function getClient(apiKey?: string): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "APIキーが設定されていません。アプリの「🔑 APIキー設定」で登録するか、.env.local に ANTHROPIC_API_KEY を設定してください。",
    );
  }
  return new Anthropic({ apiKey: key });
}

/**
 * 支出の記録画像（base64）を Claude に渡し、構造化された Receipt の配列を得る。
 * 紙のレシートは1件、決済アプリの取引履歴画面は取引ごとに1件返る。
 *
 * 構造化出力のキモ:
 *  1. tools に buildExtractionJsonSchema を渡す
 *  2. tool_choice でそのツールの使用を強制 → 必ず JSON で返る
 *  3. 返ってきた tool_use.input を Zod で検証してから返す（型と実データの整合を保証）
 */
export async function extractReceipts(
  imageBase64: string,
  mediaType: SupportedMediaType,
  categories: readonly string[] = DEFAULT_CATEGORIES,
  apiKey?: string,
): Promise<ExtractResult> {
  const client = getClient(apiKey);

  // その時点のカテゴリ一覧から tool スキーマを組み立て、enum で分類先を制約する。
  const jsonSchema = buildExtractionJsonSchema(categories);

  const message = await client.messages.create({
    model: MODEL,
    // 履歴画面は取引数×品目で出力が伸びる。1024 だと途中切断で検証に失敗し得るため増量。
    max_tokens: 4096,
    system: SYSTEM,
    tools: [
      {
        name: TOOL_NAME,
        description: "画像から抽出した支出データ（1件以上）を記録する",
        input_schema: jsonSchema as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "この画像から支出を読み取り、record_receipts ツールで記録してください。",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "モデルが構造化データを返しませんでした。" };
  }

  const parsed = extractionSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "抽出結果の形式が不正でした: " + parsed.error.message,
    };
  }

  // enum で制約していても、万一一覧外のカテゴリが返ったらフォールバックに寄せる（防御）。
  const allowed = new Set(categories);
  const receipts: Receipt[] = parsed.data.receipts.map((r) => ({
    ...r,
    items: r.items.map((it) =>
      allowed.has(it.category) ? it : { ...it, category: FALLBACK_CATEGORY },
    ),
  }));

  return { ok: true, imageKind: parsed.data.imageKind, receipts };
}

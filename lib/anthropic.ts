import Anthropic from "@anthropic-ai/sdk";
import { receiptSchema, receiptJsonSchema, type Receipt } from "./schema";

/**
 * Vision 対応モデル。精度を上げたいときは "claude-opus-4-8" に差し替え可能。
 */
const MODEL = "claude-sonnet-5";
const TOOL_NAME = "record_receipt";

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

const SYSTEM = `あなたはレシート画像を読み取り、支出データを構造化する専門アシスタントです。
- 金額は数値（円）で返す。通貨記号やカンマ、"円" の文字は含めない。
- 日付は YYYY-MM-DD 形式にする。
- category は品目ごとに、その品目自体の用途に最も合うものを1つ選ぶ（同じレシート内でも品目ごとに異なってよい）。
- 読み取りに自信が持てないほど confidence を下げる。
- レシートとして解釈できない画像でもエラーにせず、分かる範囲で埋め、confidence を 0.2 未満にする。`;

export type ExtractResult =
  | { ok: true; receipt: Receipt }
  | { ok: false; error: string };

/** APIキーを検証してクライアントを生成する（未設定なら分かりやすいエラー） */
export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local にキーを入れてください。",
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * レシート画像（base64）を Claude に渡し、構造化された Receipt を得る。
 *
 * 構造化出力のキモ:
 *  1. tools に receiptJsonSchema を渡す
 *  2. tool_choice でそのツールの使用を強制 → 必ず JSON で返る
 *  3. 返ってきた tool_use.input を Zod で検証してから返す（型と実データの整合を保証）
 */
export async function extractReceipt(
  imageBase64: string,
  mediaType: SupportedMediaType,
): Promise<ExtractResult> {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [
      {
        name: TOOL_NAME,
        description: "レシートから抽出した支出データを記録する",
        input_schema: receiptJsonSchema as unknown as Anthropic.Tool.InputSchema,
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
            text: "このレシートを読み取り、record_receipt ツールで記録してください。",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "モデルが構造化データを返しませんでした。" };
  }

  const parsed = receiptSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "抽出結果の形式が不正でした: " + parsed.error.message,
    };
  }

  return { ok: true, receipt: parsed.data };
}

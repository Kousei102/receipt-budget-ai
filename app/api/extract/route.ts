import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  extractReceipts,
  SUPPORTED_MEDIA_TYPES,
  type SupportedMediaType,
} from "@/lib/anthropic";
import { DEFAULT_CATEGORIES } from "@/lib/schema";

// APIキーを扱うのでサーバー(Node)側で実行する。
// BYOK: ユーザーのキーはヘッダーで受け取りリクエスト毎に中継するだけ。保存・ログ出力はしない。
// キーが無ければサーバーの ANTHROPIC_API_KEY にフォールバックする。
export const runtime = "nodejs";
export const maxDuration = 30;

// 画像1枚あたりの上限（デコード後 5MB）。過大なリクエストによる遅延・課金事故を防ぐ。
// base64 は元データの約 4/3 倍になるため、しきい値は base64 文字数に換算して判定する。
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const imageBase64: unknown = body?.imageBase64;
    const mediaType: unknown = body?.mediaType;
    const rawCategories: unknown = body?.categories;

    // クライアントが送ってきた現在のカテゴリ一覧で分類先を制約する。
    // 不正・未送信なら既定一覧にフォールバック（後方互換・防御）。
    const categories =
      Array.isArray(rawCategories) &&
      rawCategories.length > 0 &&
      rawCategories.every((c) => typeof c === "string" && c.length > 0)
        ? (rawCategories as string[])
        : [...DEFAULT_CATEGORIES];

    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return NextResponse.json(
        { ok: false, error: "画像データがありません。" },
        { status: 400 },
      );
    }
    if (
      typeof mediaType !== "string" ||
      !SUPPORTED_MEDIA_TYPES.includes(mediaType as SupportedMediaType)
    ) {
      return NextResponse.json(
        { ok: false, error: "対応していない画像形式です（JPEG / PNG / GIF / WebP）。" },
        { status: 400 },
      );
    }
    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "画像サイズが大きすぎます（5MBまで）。" },
        { status: 413 },
      );
    }

    // BYOK: ユーザーのキーがあれば優先。皆無なら Claude を呼ぶ前に分かりやすく 401 で返す。
    const userKey = req.headers.get("x-anthropic-api-key")?.trim() || undefined;
    if (!userKey && !process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "APIキーが設定されていません。画面下の「🔑 APIキー設定」から Anthropic APIキーを登録してください。",
        },
        { status: 401 },
      );
    }

    // 1画像から複数レコードが返り得る（決済アプリの履歴画面・クレカ明細）。
    // レスポンスは { ok, imageKind, receipts }。imageKind でクライアントが source を切り替える。
    const result = await extractReceipts(
      imageBase64,
      mediaType as SupportedMediaType,
      categories,
      userKey,
    );
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    // キーが無効（401/403）は原因をユーザーに伝えて再設定を促す。キー自体は出力しない。
    if (
      err instanceof Anthropic.AuthenticationError ||
      err instanceof Anthropic.PermissionDeniedError
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "APIキーが認証されませんでした。「🔑 APIキー設定」のキーが正しいかご確認ください。",
        },
        { status: 401 },
      );
    }
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

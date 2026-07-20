import { NextRequest, NextResponse } from "next/server";
import {
  extractReceipt,
  SUPPORTED_MEDIA_TYPES,
  type SupportedMediaType,
} from "@/lib/anthropic";

// APIキーを使うのでサーバー(Node)側で実行する。ブラウザにキーは出さない。
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

    const result = await extractReceipt(
      imageBase64,
      mediaType as SupportedMediaType,
    );
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラーが発生しました。";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

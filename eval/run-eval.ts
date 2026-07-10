/**
 * 抽出精度の評価スクリプト。
 *
 * eval/samples/ に置いた「レシート画像」と、同じ名前の「.expected.json」を突き合わせ、
 * 項目ごとの一致率を集計して出力する。
 *
 *   例: samples/receipt1.jpg  ＋  samples/receipt1.expected.json
 *
 * 実行:  npm run eval
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { extractReceipt, type SupportedMediaType } from "../lib/anthropic";
import type { Receipt } from "../lib/schema";

// --- .env.local から API キーを読み込む（Next.js を経由せず単体実行するため） ---
function loadEnv() {
  if (process.env.ANTHROPIC_API_KEY) return;
  try {
    const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* .env.local が無ければ環境変数をそのまま使う */
  }
}
loadEnv();

const SAMPLES_DIR = fileURLToPath(new URL("./samples", import.meta.url));

const MEDIA_BY_EXT: Record<string, SupportedMediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/** 正解データ（期待値）。confidence は評価対象外なので任意。 */
type Expected = Omit<Receipt, "confidence"> & { confidence?: number };

const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();

async function main() {
  const files = readdirSync(SAMPLES_DIR).filter((f) => MEDIA_BY_EXT[extname(f).toLowerCase()]);

  if (files.length === 0) {
    console.log(
      "サンプルがありません。eval/samples/ に画像と <name>.expected.json を置いてください。\n" +
        "詳しくは eval/samples/README.md を参照。",
    );
    return;
  }

  const tally = { store: 0, date: 0, category: 0, total: 0, items: 0 };
  let scored = 0;

  for (const file of files) {
    const stem = basename(file, extname(file));
    const expectedPath = join(SAMPLES_DIR, `${stem}.expected.json`);
    let expected: Expected;
    try {
      expected = JSON.parse(readFileSync(expectedPath, "utf8"));
    } catch {
      console.log(`⏭  ${file}: 期待値 ${stem}.expected.json が無いのでスキップ`);
      continue;
    }

    const mediaType = MEDIA_BY_EXT[extname(file).toLowerCase()];
    const base64 = readFileSync(join(SAMPLES_DIR, file)).toString("base64");
    const result = await extractReceipt(base64, mediaType);

    if (!result.ok) {
      console.log(`❌ ${file}: 抽出失敗 (${result.error})`);
      continue;
    }
    const got = result.receipt;
    scored++;

    const hit = {
      store: norm(got.store) === norm(expected.store),
      date: got.date === expected.date,
      // 品目カテゴリの一致：品数が一致し、各品目のカテゴリが順に一致したら○。
      category:
        got.items.length === expected.items.length &&
        got.items.every((it, i) => it.category === expected.items[i].category),
      total: Math.abs(got.total - expected.total) < 1,
      items: got.items.length === expected.items.length,
    };
    for (const k of Object.keys(tally) as (keyof typeof tally)[]) {
      if (hit[k]) tally[k]++;
    }

    const mark = (b: boolean) => (b ? "✓" : "✗");
    console.log(
      `📄 ${file}  店${mark(hit.store)} 日${mark(hit.date)} 分類${mark(hit.category)} ` +
        `合計${mark(hit.total)} 品数${mark(hit.items)}  (自信度 ${Math.round(got.confidence * 100)}%)`,
    );
  }

  if (scored === 0) {
    console.log("\n採点できたサンプルがありませんでした。");
    return;
  }

  const pct = (n: number) => `${Math.round((n / scored) * 100)}%`;
  console.log(`\n===== 集計（${scored}枚） =====`);
  console.log(`店名一致    : ${pct(tally.store)}`);
  console.log(`日付一致    : ${pct(tally.date)}`);
  console.log(`カテゴリ一致: ${pct(tally.category)}`);
  console.log(`合計一致    : ${pct(tally.total)}`);
  console.log(`品数一致    : ${pct(tally.items)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

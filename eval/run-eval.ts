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
import { extractReceipts, type SupportedMediaType } from "../lib/anthropic";
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

/**
 * 正解データ（期待値）。confidence は評価対象外なので任意。
 * `.expected.json` は単一オブジェクト（従来のレシート1枚）と配列（決済アプリの
 * 履歴画面など複数取引）の両方を受け付ける。単一なら「1件の配列」として扱う。
 */
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

  // count: レコード件数の一致。他は index 対応でレコード同士を突き合わせ、
  // ファイル単位では「一致レコード数 / max(期待件数, 抽出件数)」の割合を加算する
  // （従来の1枚=1件サンプルでは 0 か 1 になり、集計結果は従来と同一）。
  const tally = { count: 0, store: 0, date: 0, category: 0, total: 0, items: 0 };
  let scored = 0;

  for (const file of files) {
    const stem = basename(file, extname(file));
    const expectedPath = join(SAMPLES_DIR, `${stem}.expected.json`);
    let expectedList: Expected[];
    try {
      const raw = JSON.parse(readFileSync(expectedPath, "utf8"));
      expectedList = Array.isArray(raw) ? raw : [raw];
    } catch {
      console.log(`⏭  ${file}: 期待値 ${stem}.expected.json が無いのでスキップ`);
      continue;
    }

    const mediaType = MEDIA_BY_EXT[extname(file).toLowerCase()];
    const base64 = readFileSync(join(SAMPLES_DIR, file)).toString("base64");
    const result = await extractReceipts(base64, mediaType);

    if (!result.ok) {
      console.log(`❌ ${file}: 抽出失敗 (${result.error})`);
      continue;
    }
    const got = result.receipts;
    scored++;

    const countHit = got.length === expectedList.length;
    if (countHit) tally.count++;

    // 過不足があっても採点できる範囲（index 対応）で突き合わせ、超過・不足は分母で減点する。
    const denom = Math.max(expectedList.length, got.length);
    const pairs = Math.min(expectedList.length, got.length);
    const hits = { store: 0, date: 0, category: 0, total: 0, items: 0 };
    for (let i = 0; i < pairs; i++) {
      const g = got[i];
      const e = expectedList[i];
      if (norm(g.store) === norm(e.store)) hits.store++;
      if (g.date === e.date) hits.date++;
      // 品目カテゴリの一致：品数が一致し、各品目のカテゴリが順に一致したら○。
      if (
        g.items.length === e.items.length &&
        g.items.every((it, j) => it.category === e.items[j].category)
      ) {
        hits.category++;
      }
      if (Math.abs(g.total - e.total) < 1) hits.total++;
      if (g.items.length === e.items.length) hits.items++;
    }
    for (const k of Object.keys(hits) as (keyof typeof hits)[]) {
      tally[k] += hits[k] / denom;
    }

    const mark = (b: boolean) => (b ? "✓" : "✗");
    // 1件サンプルは従来どおり ✓/✗、複数件は「一致数/件数」で表示する。
    const fmt = (n: number) => (denom === 1 ? mark(n === 1) : `${n}/${denom}`);
    const avgConfidence = got.reduce((s, r) => s + r.confidence, 0) / got.length;
    console.log(
      `📄 ${file}  件数${mark(countHit)} 店${fmt(hits.store)} 日${fmt(hits.date)} ` +
        `分類${fmt(hits.category)} 合計${fmt(hits.total)} 品数${fmt(hits.items)}` +
        `  (自信度 ${Math.round(avgConfidence * 100)}%)`,
    );
  }

  if (scored === 0) {
    console.log("\n採点できたサンプルがありませんでした。");
    return;
  }

  const pct = (n: number) => `${Math.round((n / scored) * 100)}%`;
  console.log(`\n===== 集計（${scored}枚） =====`);
  console.log(`件数一致    : ${pct(tally.count)}`);
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

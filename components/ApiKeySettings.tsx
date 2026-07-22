"use client";

import { useState } from "react";

type Props = {
  /** 保存済みのユーザー APIキー（未設定なら ""）。 */
  apiKey: string;
  /** 保存・クリア。"" を渡すとクリア（localStorage のエントリごと削除）。 */
  onSave: (key: string) => void;
};

/**
 * ユーザー自身の Anthropic APIキー（BYOK）の設定 UI。
 * キーはこのブラウザの localStorage にのみ保存し、画像の読み取り時にだけ
 * 本アプリのサーバー経由で Anthropic に送る（サーバーでは保存・記録しない）。
 */
export default function ApiKeySettings({ apiKey, onSave }: Props) {
  // localStorage からの復元がマウント後に来るため prop と同期する。
  // effect ではなくレンダー中に前回値と比較して調整する（React 推奨パターン）。
  const [input, setInput] = useState(apiKey);
  const [prevApiKey, setPrevApiKey] = useState(apiKey);
  if (prevApiKey !== apiKey) {
    setPrevApiKey(apiKey);
    setInput(apiKey);
  }

  const trimmed = input.trim();
  // HTTPヘッダーで送るため印字可能 ASCII のみ許可（非ASCIIは fetch が例外を投げる）。
  const validFormat = trimmed === "" || /^[\x21-\x7E]+$/.test(trimmed);
  const changed = trimmed !== apiKey;

  function handleSave() {
    if (!validFormat || !changed) return;
    onSave(trimmed);
  }

  function handleClear() {
    if (
      !window.confirm(
        "保存済みのAPIキーを削除します。以降の読み取りには再設定が必要です。よろしいですか？",
      )
    ) {
      return;
    }
    setInput("");
    onSave("");
  }

  return (
    <details className="mt-8 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer select-none font-medium text-gray-700 dark:text-gray-300">
        🔑 APIキー設定 {apiKey ? "（設定済み）" : "（未設定）"}
      </summary>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="api-key" className="text-gray-600 dark:text-gray-400">
          Anthropic APIキー
        </label>
        <input
          id="api-key"
          type="password"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="sk-ant-..."
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 font-mono dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          onClick={handleSave}
          disabled={!validFormat || !changed}
          className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          保存
        </button>
        {apiKey && (
          <button
            onClick={handleClear}
            className="rounded border border-gray-300 px-3 py-1 text-red-600 hover:bg-gray-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-gray-800"
          >
            クリア
          </button>
        )}
      </div>

      {!validFormat && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          APIキーに使えない文字が含まれています（半角英数記号のみ・空白不可）。
        </p>
      )}
      {validFormat && trimmed !== "" && !trimmed.startsWith("sk-ant-") && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          Anthropic のAPIキーは通常 sk-ant- で始まります。入力内容をご確認ください。
        </p>
      )}

      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-gray-400">
        <li>
          キーは
          <span className="font-medium text-gray-500 dark:text-gray-400">
            このブラウザの localStorage にのみ保存
          </span>
          されます。画像の読み取り時にだけ本アプリのサーバー経由で Anthropic に送信され、サーバー側で保存・記録はしません。
        </li>
        <li>
          APIキーは{" "}
          <a
            href="https://console.anthropic.com/"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            console.anthropic.com
          </a>{" "}
          で取得できます。
        </li>
        <li>未設定の場合、運営側でキーが設定されていればそちらを使用します。</li>
      </ul>
    </details>
  );
}

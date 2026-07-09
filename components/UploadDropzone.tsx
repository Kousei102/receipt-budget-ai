"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

/**
 * レシート画像のドラッグ&ドロップ + クリック選択。
 * 受け取ったファイルはそのまま onFile で親に渡す（変換や送信は親が担当）。
 */
export default function UploadDropzone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={[
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition",
        disabled
          ? "cursor-not-allowed opacity-60 border-gray-300"
          : "cursor-pointer hover:border-gray-400",
        dragging
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-gray-300 dark:border-gray-700",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="text-4xl">🧾</div>
      <p className="font-medium">
        {disabled ? "読み取り中…" : "レシート画像をドロップ、またはクリックして選択"}
      </p>
      <p className="text-sm text-gray-500">JPEG / PNG / GIF / WebP に対応</p>
    </div>
  );
}

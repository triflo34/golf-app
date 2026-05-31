"use client";

import { useState } from "react";

export function CopyLinkButton({
  path,
  label = "Copy invite",
  className,
}: {
  path: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function copy() {
    const url =
      typeof window === "undefined"
        ? path
        : `${window.location.origin}${path}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setError(false);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1800);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:border-green-400 hover:text-green-700"
      }
    >
      <span aria-hidden="true">🔗</span>
      {copied ? "Copied!" : error ? "Copy failed" : label}
    </button>
  );
}

"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

const COPIED_FOR_MS = 1800;

/** The one-line installer as a button: click (or Enter) copies it and flips to "Copied". */
export function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // No clipboard access (plain http, old browser): select the text so Cmd/Ctrl+C works.
      const selection = window.getSelection();
      if (textRef.current && selection) selection.selectAllChildren(textRef.current);
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy the install command"
      className={`flex h-14.5 w-[640px] max-w-full cursor-pointer items-center gap-3.5 rounded-[10px] border bg-surface py-0 pr-2.25 pl-5 text-left text-ink-body shadow-[0_10px_30px_rgba(2,6,23,0.45)] transition-colors ${
        copied ? "border-green-500/40" : "border-slate-400/16 hover:border-slate-400/30"
      }`}
    >
      <span className="font-mono text-[15.5px] text-accent-bright" aria-hidden>
        $
      </span>
      <span ref={textRef} className="flex-1 truncate font-mono text-[15.5px]">
        {command}
      </span>
      <span
        className={`flex h-10 items-center gap-1.75 rounded-[7px] px-3.5 text-sm font-medium transition-colors ${
          copied ? "bg-success-bg text-success-fg" : "bg-chip text-ink-body"
        }`}
      >
        {copied ? <IconCheck size={15} aria-hidden /> : <IconCopy size={15} aria-hidden />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </span>
    </button>
  );
}

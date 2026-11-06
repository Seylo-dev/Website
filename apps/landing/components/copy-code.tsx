"use client";

import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

const COPIED_FOR_MS = 1800;

/** A command in a code block that wraps instead of scrolling, with a copy button on the right. */
export function CopyCode({ command, label }: { command: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLElement>(null);
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
    <div className="flex items-start gap-2 rounded-lg bg-code py-2 pr-2 pl-3.5">
      <code
        ref={textRef}
        className="min-w-0 flex-1 py-1 font-mono text-[13.5px] leading-[1.6] break-words text-ink-code [overflow-wrap:anywhere]"
      >
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : label}
        title={copied ? "Copied" : "Copy"}
        className={`flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors duration-200 ${
          copied ? "bg-success-bg text-success-fg" : "text-ink-muted hover:bg-chip hover:text-ink-body"
        }`}
      >
        {copied ? <IconCheck size={15} aria-hidden /> : <IconCopy size={15} aria-hidden />}
      </button>
    </div>
  );
}

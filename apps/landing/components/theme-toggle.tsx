"use client";

import { IconCheck, IconDeviceDesktop, IconMoon, IconSun, type Icon } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { type ThemeChoice, themeStorageKey } from "@/lib/theme";

const choices: { value: ThemeChoice; label: string; icon: Icon }[] = [
  { value: "system", label: "System", icon: IconDeviceDesktop },
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
];

function readChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(themeStorageKey);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** Puts the choice on <html> (no class for "system") without a fade on the elements that transition colors. */
function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  const freeze = document.createElement("style");
  freeze.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.append(freeze);
  root.classList.remove("light", "dark");
  if (choice !== "system") root.classList.add(choice);
  // Let the new colors land before transitions come back.
  void getComputedStyle(root).color;
  requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()));
}

/**
 * The theme menu in the nav: a button with the sun or the moon of the theme in effect, opening System,
 * Light and Dark as menu radio items with the current one checked. Keyboard: Enter, Space or the arrow
 * keys open it on the current choice, arrows and Home/End move, Enter or Space picks, Escape closes.
 */
export function ThemeToggle() {
  // Unknown until mounted: the server has no localStorage.
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    setChoice(readChoice());
    // Another tab changed it: follow along.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== themeStorageKey && event.key !== null) return;
      const next = readChoice();
      setChoice(next);
      applyChoice(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function focusItem(index: number) {
    const count = choices.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  }

  function openMenu(focus: "current" | "first" | "last") {
    setOpen(true);
    const current = Math.max(
      0,
      choices.findIndex((c) => c.value === (choice ?? "system")),
    );
    const index = focus === "first" ? 0 : focus === "last" ? choices.length - 1 : current;
    // The menu turns visible on this render; focus once it can take it.
    requestAnimationFrame(() => focusItem(index));
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function pick(value: ThemeChoice) {
    try {
      if (value === "system") localStorage.removeItem(themeStorageKey);
      else localStorage.setItem(themeStorageKey, value);
    } catch {
      // Storage blocked: the choice still applies to this page view.
    }
    setChoice(value);
    applyChoice(value);
    close(true);
  }

  function onButtonKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu("current");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu("last");
    }
  }

  function onMenuKey(event: React.KeyboardEvent) {
    const index = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") focusItem(index + 1);
    else if (event.key === "ArrowUp") focusItem(index - 1);
    else if (event.key === "Home") focusItem(0);
    else if (event.key === "End") focusItem(choices.length - 1);
    else if (event.key === "Escape") close(true);
    else if (event.key === "Tab") {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
  }

  const label = choice ? `Theme: ${choices.find((c) => c.value === choice)?.label}` : "Theme";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => (open ? close(false) : openMenu("current"))}
        onKeyDown={onButtonKey}
        className="hairline-strong flex size-9 cursor-pointer items-center justify-center rounded-lg bg-quiet text-ink-soft transition-[color] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* The icon of the theme in effect, from CSS, so it is right before hydration too. */}
        <IconSun size={17} stroke={1.9} aria-hidden className="dark:hidden" />
        <IconMoon size={17} stroke={1.9} aria-hidden className="light:hidden" />
      </button>
      <div
        id={menuId}
        role="menu"
        aria-label="Theme"
        onKeyDown={onMenuKey}
        className={`hairline-strong absolute top-full right-0 z-30 mt-2 flex min-w-40 origin-top-right flex-col gap-0.5 rounded-xl bg-surface/95 p-1.5 shadow-[var(--shadow-menu)] backdrop-blur-md transition-[opacity,scale] duration-150 ease-out motion-reduce:transition-none ${
          open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"
        }`}
      >
        {choices.map(({ value, label: itemLabel, icon: ItemIcon }, index) => {
          const checked = (choice ?? "system") === value;
          return (
            <button
              key={value}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={checked}
              tabIndex={-1}
              onClick={() => pick(value)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-[color,background-color] hover:bg-hover focus-visible:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                checked ? "text-ink" : "text-ink-soft"
              }`}
            >
              <ItemIcon size={16} stroke={1.9} aria-hidden className="text-ink-muted" />
              {itemLabel}
              {checked ? <IconCheck size={15} stroke={2.2} aria-hidden className="ml-auto text-accent-bright" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

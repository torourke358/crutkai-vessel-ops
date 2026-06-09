"use client";

import { useEffect, useState } from "react";

// Chrome/Edge fire this before offering install; we capture it to drive a
// custom button. It doesn't exist on iOS.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// iOS share glyph (square with an up arrow).
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="inline-block h-4 w-4 align-text-bottom"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
    </svg>
  );
}

// Reusable PWA install nudge. Same shape + behavior as petty cash's prompt:
// shows nothing once installed, respects a per-session dismissal, and gives
// iOS users explicit Share → Add to Home Screen instructions because they
// can't programmatically install.
export default function InstallPrompt() {
  const [mode, setMode] = useState<"hidden" | "button" | "ios">("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone ===
        true;
    if (standalone) return;

    if (sessionStorage.getItem("installDismissed") === "1") return;

    const ua = window.navigator.userAgent;
    const isIos =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("button");
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    function onInstalled() {
      setMode("hidden");
    }
    window.addEventListener("appinstalled", onInstalled);

    if (isIos) queueMicrotask(() => setMode("ios"));

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    sessionStorage.setItem("installDismissed", "1");
    setMode("hidden");
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setMode("hidden");
  }

  if (mode === "hidden") return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl bg-violet-600 px-4 py-3 text-white shadow-sm">
      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {mode === "button" ? (
          <>
            <p className="font-medium">Add Runa to your home screen</p>
            <p className="text-white/80">Open it like an app, full-screen.</p>
            <button
              onClick={install}
              className="mt-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-violet-700"
            >
              Add to home screen
            </button>
          </>
        ) : (
          <>
            <p className="font-medium">Add Runa to your home screen</p>
            <p className="text-white/85">
              Tap the Share button <ShareIcon /> at the bottom of Safari, then
              choose <span className="font-medium">Add to Home Screen</span>.
            </p>
          </>
        )}
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-2 text-lg leading-none text-white/80 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { LegacyPageHost } from "@/components/legacy/legacy-page-host";

const LEGACY_CARDS_SHELL_URL = "/cards/legacy-shell.html";

export function CardsPage() {
  const [hostKey, setHostKey] = useState(0);

  const handleReload = useCallback(() => {
    setHostKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const previousEmbed = root.getAttribute("data-embed");

    root.dataset.embed = "1";

    return () => {
      if (previousEmbed === null) {
        root.removeAttribute("data-embed");
        return;
      }
      root.setAttribute("data-embed", previousEmbed);
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/90">
          <button
            type="button"
            onClick={handleReload}
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[14px] inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            style={{ fontWeight: 700 }}
          >
            <RefreshCw className="w-4 h-4" />
            Обновить cards
          </button>
        </div>
      </div>

      <LegacyPageHost
        key={hostKey}
        shellUrl={LEGACY_CARDS_SHELL_URL}
        pageTitle="Media Plan — Карточки"
        summary="Загружаю дашборд карточек в общий DOM, чтобы прокрутка оставалась единой для всей страницы."
        includeInlineScripts={false}
      />
    </div>
  );
}

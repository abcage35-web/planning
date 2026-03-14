import { ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

const LEGACY_CARDS_EMBED_URL = "/cards/legacy-shell.html?embed=1";
const LEGACY_CARDS_DIRECT_URL = "/cards/legacy-shell.html";

export function CardsPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [frameKey, setFrameKey] = useState(0);

  const handleReload = useCallback(() => {
    setLoading(true);
    setFrameKey((current) => current + 1);
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
          <a
            href={LEGACY_CARDS_DIRECT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[14px] inline-flex items-center gap-2 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all no-underline"
            style={{ fontWeight: 700 }}
          >
            Открыть отдельно
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/72 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/72">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/72 px-4 pt-12 backdrop-blur-sm dark:bg-slate-950/72">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-[13px] text-slate-600 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600 dark:text-teal-400" />
              <span style={{ fontWeight: 600 }}>Поднимаю дашборд карточек…</span>
            </div>
          </div>
        ) : null}

        <iframe
          key={frameKey}
          ref={iframeRef}
          title="Cards legacy dashboard"
          src={LEGACY_CARDS_EMBED_URL}
          onLoad={() => setLoading(false)}
          className="block h-[calc(100vh-152px)] min-h-[920px] w-full border-0 bg-transparent"
        />
      </section>
    </div>
  );
}

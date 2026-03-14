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
    <div className="space-y-4">
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-teal-700 dark:text-teal-400 uppercase tracking-[0.14em] mb-0.5" style={{ fontWeight: 700 }}>
              Мониторинг карточек
            </p>
            <h1 className="text-[28px] md:text-[36px] text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontWeight: 800, lineHeight: 1.05 }}>
              Карточки товаров
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-3xl" style={{ fontWeight: 500, lineHeight: 1.45 }}>
              Возвращена старая рабочая страница карточек из `mp-cards`, но оставлена внутри нового React/Figma-каркаса,
              чтобы не потерять текущую бизнес-логику и маршруты проекта.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
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
              className="h-10 px-4 rounded-xl border border-teal-300 bg-gradient-to-b from-teal-600 to-teal-700 text-white text-[14px] inline-flex items-center gap-2 shadow-sm hover:shadow-md hover:from-teal-500 hover:to-teal-600 transition-all no-underline"
              style={{ fontWeight: 700 }}
            >
              Открыть отдельно
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/80 shadow-sm backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-900/80">
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-start justify-center bg-white/72 px-4 pt-12 backdrop-blur-sm dark:bg-slate-950/72">
            <div className="inline-flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/90 px-4 py-2 text-[13px] text-slate-600 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-300">
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600 dark:text-teal-400" />
              <span style={{ fontWeight: 600 }}>Поднимаю старую страницу карточек…</span>
            </div>
          </div>
        ) : null}

        <iframe
          key={frameKey}
          ref={iframeRef}
          title="Cards legacy dashboard"
          src={LEGACY_CARDS_EMBED_URL}
          onLoad={() => setLoading(false)}
          className="block h-[calc(100vh-180px)] min-h-[860px] w-full border-0 bg-white"
        />
      </section>
    </div>
  );
}

import { AlertTriangle, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { getLegacyPageDefinition, loadLegacyPageAssets, type LegacyPageDefinition } from "@/services/legacy-page.service";

type HostStatus = "loading" | "booting" | "ready" | "error";

interface LegacyPageHostProps {
  shellUrl: string;
  pageTitle: string;
  summary: string;
  includeInlineScripts?: boolean;
  onBeforeBoot?: () => void;
}

export function LegacyPageHost({
  shellUrl,
  pageTitle,
  summary,
  includeInlineScripts = true,
  onBeforeBoot,
}: LegacyPageHostProps) {
  const [status, setStatus] = useState<HostStatus>("loading");
  const [definition, setDefinition] = useState<LegacyPageDefinition | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(async () => {
    setStatus("loading");
    setErrorMessage("");

    try {
      onBeforeBoot?.();
      const nextDefinition = await getLegacyPageDefinition(shellUrl, { includeInlineScripts });
      setDefinition(nextDefinition);
      document.title = pageTitle || nextDefinition.title || "Media Plan";
    } catch (error) {
      setStatus("error");
      setDefinition(null);
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить legacy shell.");
    }
  }, [includeInlineScripts, onBeforeBoot, pageTitle, shellUrl]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!definition || !hostRef.current) {
      return undefined;
    }

    let cancelled = false;
    setStatus("booting");
    onBeforeBoot?.();

    const frameId = window.requestAnimationFrame(() => {
      void loadLegacyPageAssets(definition)
        .then(() => {
          if (!cancelled) {
            setStatus("ready");
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setStatus("error");
            setErrorMessage(error instanceof Error ? error.message : "Не удалось поднять legacy assets.");
          }
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [definition, onBeforeBoot]);

  return (
    <div className="relative min-h-screen">
      {definition ? (
        <div
          ref={hostRef}
          className={cn(status !== "ready" && "pointer-events-none")}
          dangerouslySetInnerHTML={{ __html: definition.bodyHtml }}
        />
      ) : null}

      {status !== "ready" ? (
        <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-background/72 px-4 pt-24 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-[28px] border border-white/60 bg-white/90 p-6 shadow-[0_28px_90px_-38px_rgba(15,23,42,0.62)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/86">
            {status === "error" ? (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-500/12 text-red-600 dark:text-red-300">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-600/80 dark:text-red-300/80">
                      Legacy host error
                    </p>
                    <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-50">
                      Не удалось поднять страницу
                    </h2>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{summary}</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-red-500/20 bg-red-500/6 px-4 py-3 font-mono text-sm text-red-700 dark:text-red-200">
                  {errorMessage}
                </div>
                <Button variant="primary" onClick={() => void loadPage()}>
                  <RotateCcw className="h-4 w-4" />
                  Повторить загрузку
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-teal-500/12 text-teal-700 dark:text-teal-300">
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700 dark:text-teal-300">
                      {status === "loading" ? "Legacy shell" : "Runtime boot"}
                    </p>
                    <h2 className="text-2xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-slate-50">
                      {status === "loading" ? "Загружаю страницу" : "Подключаю стили и скрипты"}
                    </h2>
                    <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{summary}</p>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full bg-linear-to-r from-teal-500 via-teal-400 to-cyan-400 transition-all",
                      status === "loading" ? "w-2/5" : "w-4/5",
                    )}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

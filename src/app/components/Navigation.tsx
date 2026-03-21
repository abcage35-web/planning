import { Link, useLocation } from "react-router";
import { BarChart3, FileText, Sun, Moon, ExternalLink, FlaskConical } from "lucide-react";

interface NavigationProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

export function Navigation({ darkMode, onToggleDarkMode }: NavigationProps) {
  const location = useLocation();

  const navItems = [
    { path: "/ab-tests-xway", label: "AB-тесты XWAY", icon: FlaskConical },
    { path: "/ab-tests", label: "AB-тесты", icon: BarChart3 },
    { path: "/cards", label: "Карточки товаров", icon: FileText },
  ];

  const xwayUrl = "https://am.xway.ru/wb/ab-tests";

  return (
    <nav className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-2 shadow-sm mb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const pathname = location.pathname.replace(/\/+$/, "") || "/";
            const normalizedPath = item.path.replace(/\/+$/, "") || "/";
            const isDashboardAlias = normalizedPath === "/ab-tests" && pathname === "/";
            const isActive = pathname === normalizedPath || isDashboardAlias;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`px-4 py-2 rounded-xl text-[14px] inline-flex items-center gap-2 transition-all ${
                  isActive
                    ? "bg-gradient-to-b from-teal-600 to-teal-700 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
                style={{ fontWeight: 600 }}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
        
        <div className="flex items-center gap-2">
          {/* XWAY link */}
          <a
            href={xwayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-10 px-4 rounded-xl border border-orange-300 dark:border-orange-700 bg-gradient-to-b from-orange-500 to-orange-600 dark:from-orange-600 dark:to-orange-700 text-white text-[14px] inline-flex items-center gap-2 shadow-sm hover:shadow-md hover:from-orange-400 hover:to-orange-500 dark:hover:from-orange-500 dark:hover:to-orange-600 transition-all"
            style={{ fontWeight: 700 }}
            title="Открыть XWAY"
          >
            <span>XWAY</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Theme toggle */}
          <button
            onClick={onToggleDarkMode}
            className="w-10 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
            title={darkMode ? "Светлая тема" : "Тёмная тема"}
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </nav>
  );
}

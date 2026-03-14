import { useState, useEffect } from "react";
import { Outlet } from "react-router";
import { Navigation } from "./components/Navigation";

export function Layout() {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ab-theme") === "dark";
    }
    return false;
  });

  // Apply dark mode class to html
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("ab-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <div className="min-h-screen bg-[#f8f9fb] dark:bg-slate-950 transition-colors" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 w-[400px] h-[400px] rounded-full opacity-[0.15] dark:opacity-[0.07]" style={{ background: "radial-gradient(circle, #93c5fd 0%, transparent 70%)" }} />
        <div className="absolute -right-40 -top-36 w-[480px] h-[480px] rounded-full opacity-[0.12] dark:opacity-[0.06]" style={{ background: "radial-gradient(circle, #a5f3fc 0%, transparent 70%)" }} />
        <div className="absolute left-1/3 bottom-0 w-[500px] h-[300px] rounded-full opacity-[0.08] dark:opacity-[0.04]" style={{ background: "radial-gradient(circle, #c4b5fd 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-[1920px] mx-auto px-3 md:px-5 py-4">
        <Navigation darkMode={darkMode} onToggleDarkMode={() => setDarkMode(!darkMode)} />
        <Outlet />
      </div>
    </div>
  );
}

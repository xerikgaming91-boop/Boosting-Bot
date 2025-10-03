import React, { useEffect, useRef, useState } from "react";

// vordefinierte Sprachen
const LANGS = [
  { code: "de", label: "Deutsch" },
  { code: "en", label: "English" },
];

function getInitialLang() {
  const saved = localStorage.getItem("lang");
  if (saved) return saved;
  // Browser-Default
  const n = (navigator.language || "en").toLowerCase();
  return n.startsWith("de") ? "de" : "en";
}

export default function LanguageMenu() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(getInitialLang());
  const boxRef = useRef(null);

  // beim Mount/Änderung anwenden
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("lang", lang);
    // optional: globaler Event, falls du später i18n triggern willst
    window.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  }, [lang]);

  // Klick außerhalb: schließen
  useEffect(() => {
    function onDocClick(e) {
      if (!open) return;
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        className="btn px-2 py-1.5 text-sm"
        title="Einstellungen"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
      >
        {/* kleines Zahnrad-Icon (inline SVG) */}
        <svg width="18" height="18" viewBox="0 0 24 24" className="inline-block align-middle">
          <path
            fill="currentColor"
            d="M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8m8.94 3a8.06 8.06 0 0 1 0 2l2.02 1.58a.5.5 0 0 1 .12.66l-1.91 3.3a.5.5 0 0 1-.6.22l-2.38-.96a7.99 7.99 0 0 1-1.74 1.01l-.36 2.54a.5.5 0 0 1-.5.41h-3.82a.5.5 0 0 1-.5-.41l-.36-2.54a7.99 7.99 0 0 1-1.74-1.01l-2.38.96a.5.5 0 0 1-.6-.22l-1.91-3.3a.5.5 0 0 1 .12-.66L3.06 13a8.06 8.06 0 0 1 0-2L1.04 9.42a.5.5 0 0 1-.12-.66l1.91-3.3a.5.5 0 0 1 .6-.22l2.38.96c.54-.4 1.12-.74 1.74-1.01l.36-2.54a.5.5 0 0 1 .5-.41h3.82a.5.5 0 0 1 .5.41l.36 2.54c.62.27 1.2.61 1.74 1.01l2.38-.96a.5.5 0 0 1 .6.22l1.91 3.3a.5.5 0 0 1-.12.66L20.94 11Z"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Sprachauswahl"
          className="absolute right-0 mt-2 w-44 rounded-lg border border-slate-800 bg-slate-900 shadow-lg p-1"
        >
          <div className="px-2 py-1 text-xs text-slate-400">Sprache</div>
          {LANGS.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                role="menuitemradio"
                aria-checked={active ? "true" : "false"}
                className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                  active
                    ? "bg-slate-800 text-slate-100"
                    : "text-slate-300 hover:bg-slate-800/70"
                }`}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
              >
                {l.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

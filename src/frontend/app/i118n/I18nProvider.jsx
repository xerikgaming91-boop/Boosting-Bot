import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { MESSAGES } from "./messages.js";

const I18nCtx = createContext({ t: (k)=>k, lang: "en", setLang: ()=>{} });

function getInitialLang() {
  const saved = localStorage.getItem("lang");
  if (saved && MESSAGES[saved]) return saved;
  const n = (navigator.language || "en").toLowerCase();
  return n.startsWith("de") ? "de" : "en";
}

function format(str, vars = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, key) => (vars?.[key] ?? ""));
}

function getNested(obj, path) {
  return path.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : undefined), obj);
}

export function useI18n() {
  return useContext(I18nCtx);
}

export default function I18nProvider({ children }) {
  const [lang, setLang] = useState(getInitialLang());

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("lang", lang);
    window.dispatchEvent(new CustomEvent("langchange", { detail: lang }));
  }, [lang]);

  const t = useMemo(() => {
    return (key, vars) => {
      const dict = MESSAGES[lang] || MESSAGES.en;
      const val = getNested(dict, key) ?? getNested(MESSAGES.en, key) ?? key;
      return typeof val === "string" ? format(val, vars) : val;
    };
  }, [lang]);

  const value = useMemo(() => ({ t, lang, setLang }), [t, lang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

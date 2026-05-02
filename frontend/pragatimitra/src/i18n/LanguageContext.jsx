import { createContext, useContext, useState } from "react";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("pm_lang") || "en"
  );

  const toggle = () =>
    setLang((l) => {
      const next = l === "en" ? "hi" : "en";
      localStorage.setItem("pm_lang", next);
      return next;
    });

  return (
    <LanguageContext.Provider value={{ lang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  // safe fallback if used outside the provider
  return ctx ?? { lang: "en", toggle: () => {} };
}

import { createContext, useContext } from "react";

/* Shell context lives in its own module so that Appshell.jsx exports ONLY a
   component. Mixing a hook export (useShell) into Appshell.jsx disabled React
   Fast Refresh for it, which left the top-bar (year picker) stuck on a stale
   module during dev. Keep this file component-free. */
export const ShellContext = createContext(null);
export const useShell = () => useContext(ShellContext);

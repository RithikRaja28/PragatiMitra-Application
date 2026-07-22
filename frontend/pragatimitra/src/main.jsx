import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Provider } from "react-redux";
import store from "./store";
import router from "./router";
import { AuthProvider } from "./store/AuthContext";
import { LanguageProvider } from "./i18n/LanguageContext";
import { AcademicYearProvider } from "./store/AcademicYearContext";
import { ToastProvider } from "./components/shared/Toast";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <ToastProvider>
          <LanguageProvider>
            <AcademicYearProvider>
              <RouterProvider router={router} />
            </AcademicYearProvider>
          </LanguageProvider>
        </ToastProvider>
      </AuthProvider>
    </Provider>
  </StrictMode>
);
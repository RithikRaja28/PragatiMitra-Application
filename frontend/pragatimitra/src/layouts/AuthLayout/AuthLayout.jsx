import { Outlet } from "react-router-dom";
import "./AuthLayout.css";

export default function AuthLayout() {
  return (
    <div className="auth-root">
      {/* Ambient background blobs */}
      <div className="auth-blob auth-blob--tl" />
      <div className="auth-blob auth-blob--br" />

      {/* Floating decorative SVG accents (Zoho-style calculator/doc icons) */}
      <svg className="auth-deco auth-deco--1" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="4" width="48" height="56" rx="6" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
        <rect x="16" y="16" width="32" height="6" rx="2" fill="#93C5FD"/>
        <rect x="16" y="28" width="20" height="4" rx="2" fill="#BFDBFE"/>
        <rect x="16" y="38" width="28" height="4" rx="2" fill="#BFDBFE"/>
        <rect x="16" y="48" width="14" height="4" rx="2" fill="#BFDBFE"/>
      </svg>
      <svg className="auth-deco auth-deco--2" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="48" height="48" rx="8" fill="#EFF6FF" stroke="#BFDBFE" strokeWidth="2"/>
        <rect x="12" y="12" width="10" height="10" rx="2" fill="#93C5FD"/>
        <rect x="28" y="12" width="10" height="10" rx="2" fill="#BFDBFE"/>
        <rect x="12" y="28" width="10" height="10" rx="2" fill="#BFDBFE"/>
        <rect x="28" y="28" width="10" height="10" rx="2" fill="#60A5FA"/>
        <rect x="12" y="44" width="26" height="4" rx="2" fill="#DBEAFE"/>
      </svg>
      <svg className="auth-deco auth-deco--3" viewBox="0 0 48 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="40" height="56" rx="6" fill="#F0F9FF" stroke="#BAE6FD" strokeWidth="2"/>
        <line x1="12" y1="20" x2="36" y2="20" stroke="#7DD3FC" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="12" y1="30" x2="36" y2="30" stroke="#BAE6FD" strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="40" x2="28" y2="40" stroke="#BAE6FD" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="36" cy="50" r="6" fill="#38BDF8" opacity="0.5"/>
        <path d="M33 50 L35.5 52.5 L39 48" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <svg className="auth-deco auth-deco--4" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="26" cy="26" r="22" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
        <path d="M18 26 L24 32 L34 20" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>

      {/* Main slot */}
      <main className="auth-main">
        <Outlet />
      </main>

      
    </div>
  );
}
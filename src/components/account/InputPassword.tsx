"use client";

// Campo password con toggle mostra/nascondi (icon-button occhio nel campo).
// Stile allineato a inputCls del design system.

import { useState } from "react";

import { inputCls } from "@/components/gestore/ui";

export default function InputPassword({
  id,
  name = "password",
  autoComplete,
  required = true,
  minLength,
}: {
  id: string;
  name?: string;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
}) {
  const [visibile, setVisibile] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visibile ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        className={`${inputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisibile((v) => !v)}
        aria-pressed={visibile}
        aria-label={visibile ? "Nascondi password" : "Mostra password"}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted transition-colors hover:text-foreground"
      >
        {visibile ? (
          // Occhio sbarrato
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          // Occhio
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

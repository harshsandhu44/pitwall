"use client";

import type { ReactNode } from "react";
import { useArrival } from "@/lib/motion";

export function PageHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  const ref = useArrival<HTMLDivElement>();
  return (
    <div ref={ref} className="relative mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        {/* The title rises out of its own line box; pb keeps the italic's descenders inside the clip. */}
        <h1 className="overflow-hidden pb-0.5 font-display-italic text-2xl leading-[1.1] font-black tracking-tight uppercase text-balance sm:text-3xl">
          <span data-title className="block">
            {title}
          </span>
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      <span aria-hidden data-stripe className="absolute -bottom-px left-0 h-0.5 w-16 origin-left bg-live" />
    </div>
  );
}

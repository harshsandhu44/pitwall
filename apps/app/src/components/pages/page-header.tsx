import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
      <div className="min-w-0">
        <h1 className="font-display text-2xl leading-[1.1] font-black tracking-tight uppercase text-balance sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

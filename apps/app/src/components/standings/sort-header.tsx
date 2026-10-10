import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

export function SortHeader<K extends string>({
  sortKey,
  sort,
  onSort,
  children,
  className,
}: {
  sortKey: K;
  sort: Sort<K>;
  onSort: (s: Sort<K>) => void;
  children: ReactNode;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDownIcon : sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
      >
        {children}
        <Icon aria-hidden className="size-3 opacity-60" />
      </button>
    </TableHead>
  );
}

export function sortBy<T, K extends string>(rows: T[], sort: Sort<K>, value: (row: T, key: K) => number | string | null) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key);
    const vb = value(b, sort.key);
    if (va === vb) return 0;
    if (va === null) return 1; // unknowns always last
    if (vb === null) return -1;
    return (va < vb ? -1 : 1) * dir;
  });
}

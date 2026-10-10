import type { ClassificationEntry, QualifyingEntry } from "@pitwall/shared";
import Link from "next/link";
import { EmptyState } from "@/components/data/query-state";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { driverName, formatPoints } from "@/lib/format";

export function ClassificationTable({ entries, season, caption }: { entries: ClassificationEntry[]; season: number; caption: string }) {
  if (!entries.length) return <EmptyState>Not published yet.</EmptyState>;
  return (
    <Table>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="hidden sm:table-cell">Constructor</TableHead>
          <TableHead className="hidden text-right md:table-cell">Grid</TableHead>
          <TableHead className="hidden text-right md:table-cell">Laps</TableHead>
          <TableHead>Time / status</TableHead>
          <TableHead className="hidden text-right lg:table-cell">Fastest lap</TableHead>
          <TableHead className="text-right">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.driver.id}>
            <TableCell className="font-mono tabular-nums">{e.positionText}</TableCell>
            <TableCell>
              <Link href={`/driver?id=${e.driver.id}&season=${season}`} className="font-medium hover:underline">{driverName(e.driver)}</Link>
              <span className="block text-[11px] text-muted-foreground sm:hidden">{e.constructor.name}</span>
            </TableCell>
            <TableCell className="hidden sm:table-cell">
              <Link href={`/team?id=${e.constructor.id}&season=${season}`} className="hover:underline">{e.constructor.name}</Link>
            </TableCell>
            <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{e.grid === 0 ? "PL" : e.grid ?? "—"}</TableCell>
            <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">{e.laps ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs tabular-nums">{e.time ?? e.status}</TableCell>
            <TableCell className="hidden text-right font-mono text-xs tabular-nums lg:table-cell">
              {e.fastestLap?.time ?? "—"}
              {e.fastestLap?.rank === 1 && <span className="ml-1 rounded-sm bg-foreground px-1 text-background">FL</span>}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatPoints(e.points)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function QualifyingTable({ entries, season }: { entries: QualifyingEntry[]; season: number }) {
  if (!entries.length) return <EmptyState>No qualifying classification available.</EmptyState>;
  return (
    <Table>
      <TableCaption className="sr-only">Qualifying classification</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">Pos</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead className="hidden sm:table-cell">Constructor</TableHead>
          <TableHead className="text-right">Q1</TableHead>
          <TableHead className="text-right">Q2</TableHead>
          <TableHead className="text-right">Q3</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((e) => (
          <TableRow key={e.driver.id}>
            <TableCell className="font-mono tabular-nums">{e.position ?? "—"}</TableCell>
            <TableCell>
              <Link href={`/driver?id=${e.driver.id}&season=${season}`} className="font-medium hover:underline">{driverName(e.driver)}</Link>
            </TableCell>
            <TableCell className="hidden sm:table-cell">{e.constructor.name}</TableCell>
            {[e.q1, e.q2, e.q3].map((t, i) => (
              <TableCell key={i} className="text-right font-mono text-xs tabular-nums">{t ?? "—"}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

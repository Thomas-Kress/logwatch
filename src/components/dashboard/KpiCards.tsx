import { Activity, Bell, FileText, ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiValues = {
  files: number;
  rate: number;
  warnings: number;
  errors: number;
  alerts: number;
};

const cards = [
  { key: "files", label: "Files in view", icon: FileText, accent: "text-sky-300" },
  { key: "rate", label: "Lines / min", icon: Activity, accent: "text-emerald-300" },
  { key: "warnings", label: "Warnings", icon: AlertTriangle, accent: "text-amber-300" },
  { key: "errors", label: "Errors", icon: ShieldAlert, accent: "text-red-300" },
  { key: "alerts", label: "Active alerts", icon: Bell, accent: "text-violet-300" },
] as const;

export function KpiCards({ values }: { values: KpiValues }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <article
            key={card.key}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{card.label}</p>
              <Icon className={cn("size-4", card.accent)} />
            </div>
            <p className="mt-3 font-mono text-3xl tracking-tight text-zinc-50">
              {values[card.key]}
            </p>
          </article>
        );
      })}
    </section>
  );
}

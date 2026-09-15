import type { HealthCycle } from "@/lib/types";

export const MAX_HEALTH_CYCLES = 240;
export const MAX_HEALTH_CHANGED_FILES = 80;

type ListedFile = {
  name: string;
  size: number;
  mtimeMs: number;
};

type PreviousFile = {
  size: number;
  mtimeMs: number;
};

export function fileFingerprint(file: ListedFile): PreviousFile {
  return { size: file.size, mtimeMs: file.mtimeMs };
}

export function indexListedFiles(files: ListedFile[]) {
  return new Map(files.map((file) => [file.name, fileFingerprint(file)]));
}

export function classifyCycleFiles(
  listed: ListedFile[],
  previous: Map<string, PreviousFile>,
): { changedFiles: string[]; unchangedFiles: string[] } {
  const changedFiles: string[] = [];
  const unchangedFiles: string[] = [];

  for (const file of listed) {
    const prev = previous.get(file.name);
    if (!prev || prev.size !== file.size || prev.mtimeMs !== file.mtimeMs) {
      changedFiles.push(file.name);
    } else {
      unchangedFiles.push(file.name);
    }
  }

  return { changedFiles, unchangedFiles };
}

export function slimHealthCycle(cycle: HealthCycle): HealthCycle {
  const unchangedCount = cycle.unchangedCount ?? cycle.unchangedFiles.length;
  const changedCount = cycle.changedCount ?? cycle.changedFiles.length;
  return {
    ...cycle,
    unchangedCount,
    changedCount,
    changedFiles: cycle.changedFiles.slice(0, MAX_HEALTH_CHANGED_FILES),
    unchangedFiles: [],
  };
}

export function appendHealthCycle(
  cycles: HealthCycle[],
  cycle: HealthCycle,
  max = MAX_HEALTH_CYCLES,
) {
  for (const existing of cycles) {
    if (existing.unchangedFiles.length > 0) {
      existing.unchangedCount =
        existing.unchangedCount ?? existing.unchangedFiles.length;
      existing.unchangedFiles = [];
    }
  }
  cycles.push(
    slimHealthCycle({
      ...cycle,
      unchangedCount: cycle.unchangedCount ?? cycle.unchangedFiles.length,
      changedCount: cycle.changedCount ?? cycle.changedFiles.length,
    }),
  );
  if (cycles.length > max) {
    cycles.splice(0, cycles.length - max);
  }
  return cycles;
}

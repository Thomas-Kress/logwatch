import type { HealthCycle } from "@/lib/types";

export const MAX_HEALTH_CYCLES = 240;

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

export function appendHealthCycle(
  cycles: HealthCycle[],
  cycle: HealthCycle,
  max = MAX_HEALTH_CYCLES,
) {
  cycles.push(cycle);
  if (cycles.length > max) {
    cycles.splice(0, cycles.length - max);
  }
  return cycles;
}

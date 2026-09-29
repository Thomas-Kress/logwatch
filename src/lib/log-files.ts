import { LOG_COVERAGE_MS } from "@/lib/data-window";

const ROTATION_SUFFIX = /^(.*)_(\d{2})\.txt$/i;
const GLOB_ESCAPE = /[.+^${}()|[\]\\]/g;

export type LogRotation = {
  base: string;
  index: number;
};

export function parseLogRotation(name: string): LogRotation {
  const match = name.match(ROTATION_SUFFIX);
  if (!match) {
    return { base: name, index: 0 };
  }
  return { base: match[1], index: Number(match[2]) };
}

export function isCurrentRotation(name: string): boolean {
  return parseLogRotation(name).index === 0;
}

export function expandFilePatternForRotations(pattern: string): string {
  if (/_00\.txt$/i.test(pattern)) {
    return pattern.replace(/_00\.txt$/i, "_[0-9][0-9].txt");
  }
  if (pattern.includes("_00")) {
    return pattern.replaceAll("_00", "_[0-9][0-9]");
  }
  return pattern;
}

export function matchesFilePattern(name: string, pattern: string): boolean {
  return globToRegExp(pattern).test(name);
}

export function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (const char of glob) {
    if (char === "*") {
      source += ".*";
    } else if (char === "?") {
      source += ".";
    } else {
      source += char.replace(GLOB_ESCAPE, "\\$&");
    }
  }
  return new RegExp(`${source}$`, "i");
}

export function selectLogFilesForCoverage<
  T extends { name: string; mtimeMs: number },
>(
  files: T[],
  pattern: string,
  now = Date.now(),
  coverageMs = LOG_COVERAGE_MS,
): T[] {
  const patternRe = globToRegExp(pattern);
  const selected = new Map<string, T>();

  for (const file of files) {
    if (patternRe.test(file.name)) {
      selected.set(file.name, file);
    }
  }

  const cutoff = now - coverageMs;
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const { base } = parseLogRotation(file.name);
    const group = groups.get(base);
    if (group) {
      group.push(file);
    } else {
      groups.set(base, [file]);
    }
  }

  for (const group of groups.values()) {
    if (!group.some((file) => patternRe.test(file.name))) {
      continue;
    }
    group.sort(
      (a, b) => parseLogRotation(a.name).index - parseLogRotation(b.name).index,
    );
    for (let i = 0; i < group.length; i++) {
      selected.set(group[i].name, group[i]);
      const older = group[i + 1];
      // Older sibling mtime is when this file started (Automic rotation).
      const startedAt = older?.mtimeMs;
      if (startedAt === undefined || startedAt <= cutoff) {
        break;
      }
    }
  }

  return [...selected.values()];
}

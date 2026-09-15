import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function posixQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function fileKey(server: string | undefined, name: string): string {
  return server ? `${server}:${name}` : name;
}

export function fileLabel(name: string, serverHost?: string, multi = false) {
  const short = name.replace(/_00\.txt$/, "");
  if (!multi || !serverHost) {
    return short;
  }
  const host = serverHost.split(".")[0] ?? serverHost;
  return `${short} · ${host}`;
}

export function expandHome(filePath: string): string {
  if (filePath === "~") {
    return process.env.HOME || process.env.USERPROFILE || filePath;
  }
  if (filePath.startsWith("~/") || filePath.startsWith("~\\")) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return `${home}${filePath.slice(1)}`;
  }
  return filePath;
}

export const chartTooltip = {
  backgroundColor: "#18181b",
  borderColor: "#3f3f46",
  textStyle: { color: "#fafafa" },
};

export const chartText = { color: "#a1a1aa" };

export const chartColors = {
  info: "#38bdf8",
  warn: "#fbbf24",
  error: "#f87171",
  debug: "#71717a",
  cp: "#818cf8",
  wp: "#34d399",
  log: "#38bdf8",
  trace: "#a78bfa",
  slowDb: "#f59e0b",
  activation: "#38bdf8",
  jwp: "#f472b6",
  jcp: "#fb923c",
  rest: "#94a3b8",
  pwp: "#e879f9",
  dwp: "#2dd4bf",
  other: "#71717a",
};

export const opcColors: Record<string, string> = {
  BIND: "#a78bfa",
  CLSE: "#94a3b8",
  CMIT: "#f59e0b",
  DBPC: "#c084fc",
  DELT: "#f87171",
  DELE: "#f87171",
  EXEC: "#38bdf8",
  FETC: "#22d3ee",
  INSE: "#f472b6",
  INSR: "#f472b6",
  OPEN: "#818cf8",
  PREP: "#60a5fa",
  ROLL: "#fb7185",
  SLCO: "#34d399",
  SLCT: "#34d399",
  SLCU: "#2dd4bf",
  UPDT: "#fb923c",
};

const OPC_FALLBACK = [
  "#f59e0b",
  "#818cf8",
  "#34d399",
  "#38bdf8",
  "#f87171",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
];

export function colorForOpc(opc: string, index = 0): string {
  return opcColors[opc.toUpperCase()] ?? OPC_FALLBACK[index % OPC_FALLBACK.length];
}

export function colorForProcessType(type: string): string {
  switch (type.toUpperCase()) {
    case "PWP":
      return chartColors.pwp;
    case "WP":
      return chartColors.wp;
    case "DWP":
      return chartColors.dwp;
    case "JWP":
      return chartColors.jwp;
    case "CP":
      return chartColors.cp;
    case "JCP":
      return chartColors.jcp;
    case "REST":
      return chartColors.rest;
    default:
      return chartColors.other;
  }
}

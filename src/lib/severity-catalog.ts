import { normalizeMessageId } from "@/lib/ae-meta";
import catalogJson from "@/data/message-severity.json";
import type { Severity } from "@/lib/types";

const MESSAGE_SEVERITY = new Map<string, Severity>(
  Object.entries(catalogJson).map(([id, severity]) => [
    normalizeMessageId(id),
    severity as Severity,
  ]),
);

export function severityForMessageId(messageId?: string): Severity | undefined {
  if (!messageId) {
    return undefined;
  }
  return MESSAGE_SEVERITY.get(normalizeMessageId(messageId));
}

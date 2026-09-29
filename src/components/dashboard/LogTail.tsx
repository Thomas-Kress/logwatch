"use client";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { eventTime } from "@/lib/data-window";
import type { LogLine, Severity } from "@/lib/types";
import { fileLabel } from "@/lib/utils";

type LogTailProps = {
  lines: LogLine[];
  multiServer?: boolean;
};

const severityColor: Record<Severity, string> = {
  error: "error.main",
  warn: "warning.main",
  info: "info.main",
  debug: "text.disabled",
  unknown: "text.secondary",
};

function formatTs(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatPreview(line: LogLine) {
  const message = line.messageId
    ? `${line.messageId} ${line.message}`
    : line.message;
  const extras = [line.objectName, line.runId].filter(Boolean);
  return extras.length > 0 ? `${message} · ${extras.join(" · ")}` : message;
}

const mono = {
  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  fontSize: 13,
};

export function LogTail({ lines, multiServer = false }: LogTailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToTop = useRef(true);
  const [listOpen, setListOpen] = useState(false);

  const visible = useMemo(
    () =>
      [...lines].sort((a, b) => {
        const delta = eventTime(b) - eventTime(a);
        return delta !== 0 ? delta : b.id - a.id;
      }),
    [lines],
  );

  useEffect(() => {
    if (!listOpen || !stickToTop.current || !scrollerRef.current) {
      return;
    }
    scrollerRef.current.scrollTop = 0;
  }, [listOpen, visible]);

  return (
    <Accordion
      expanded={listOpen}
      onChange={(_, expanded) => setListOpen(expanded)}
      variant="outlined"
      sx={{ overflow: "hidden", borderRadius: 2 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box
          sx={{
            display: "flex",
            width: "100%",
            pr: 1,
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Live tail
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {listOpen
              ? `${visible.length} warnings & errors`
              : `${visible.length} hidden`}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0 }}>
        <TableContainer
          ref={scrollerRef}
          onScroll={(event) => {
            stickToTop.current = event.currentTarget.scrollTop < 40;
          }}
          sx={{ maxHeight: 448 }}
        >
          {visible.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 4 }}>
              No warnings or errors match the current filters.
            </Typography>
          ) : (
            <Table size="small" stickyHeader>
              <TableBody>
                {visible.map((line) => (
                  <TableRow key={line.id} hover>
                    <TableCell sx={{ ...mono, color: "text.secondary", whiteSpace: "nowrap" }}>
                      {formatTs(line.ts)}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...mono,
                        color: "text.secondary",
                        display: { xs: "none", lg: "table-cell" },
                        maxWidth: 190,
                      }}
                    >
                      <Typography noWrap variant="inherit">
                        {fileLabel(line.file, line.serverHost, multiServer)}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        ...mono,
                        color: "text.disabled",
                        display: { xs: "none", lg: "table-cell" },
                      }}
                    >
                      {line.role}
                    </TableCell>
                    <TableCell
                      sx={{
                        ...mono,
                        textTransform: "uppercase",
                        color: severityColor[line.severity],
                        display: { xs: "none", lg: "table-cell" },
                      }}
                    >
                      {line.severity}
                    </TableCell>
                    <TableCell sx={{ ...mono, color: severityColor[line.severity] }}>
                      {formatPreview(line)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  );
}

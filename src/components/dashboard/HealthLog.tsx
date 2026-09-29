"use client";

import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState } from "react";
import { MAX_HEALTH_CYCLES } from "@/lib/health-log";
import type { HealthCycle } from "@/lib/types";
import { fileLabel } from "@/lib/utils";

type HealthLogProps = {
  cycles: HealthCycle[];
  multiServer?: boolean;
};

function formatCycleTime(at: number) {
  return new Date(at).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function FileNames({
  files,
  serverHost,
  multiServer,
  empty,
}: {
  files: string[];
  serverHost: string;
  multiServer: boolean;
  empty: string;
}) {
  if (files.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        {empty}
      </Typography>
    );
  }
  return (
    <List dense disablePadding>
      {files.map((name) => (
        <ListItem key={name} disableGutters sx={{ py: 0.25 }}>
          <ListItemText
            primary={fileLabel(name, serverHost, multiServer)}
            slotProps={{
              primary: {
                noWrap: true,
                sx: {
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 12,
                },
              },
            }}
          />
        </ListItem>
      ))}
    </List>
  );
}

export function HealthLog({ cycles, multiServer = false }: HealthLogProps) {
  const [expandedId, setExpandedId] = useState<number | "none" | undefined>(
    undefined,
  );
  const latest = cycles[0];
  const openId =
    expandedId === undefined
      ? latest?.id
      : expandedId === "none"
        ? undefined
        : expandedId;

  return (
    <Card id="health-log" sx={{ maxHeight: 576, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <CardHeader
        title="Health log"
        subheader={
          latest ? (
            `Last update cycle ${formatCycleTime(latest.at)}${
              multiServer ? ` · ${latest.serverHost}` : ""
            } · ${latest.linesSelected} lines selected · ${
              latest.changedCount ?? latest.changedFiles.length
            } changed · ${latest.unchangedCount ?? latest.unchangedFiles.length} unchanged`
          ) : (
            `Each file refresh is recorded here so you can see whether the watcher is picking up log changes. History is kept for the last ${MAX_HEALTH_CYCLES} cycles.`
          )
        }
        sx={{
          "& .MuiCardHeader-title": { fontSize: 14, fontWeight: 500 },
          "& .MuiCardHeader-subheader": { fontSize: 12 },
        }}
      />
      <Divider />
      <Box sx={{ flex: 1, overflow: "auto" }}>
        {cycles.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
            No update cycles yet. The log keeps a history once the watcher starts
            listing files.
          </Typography>
        ) : (
          cycles.map((cycle) => {
            const open = openId === cycle.id;
            return (
              <Accordion
                key={cycle.id}
                expanded={open}
                onChange={(_, expanded) =>
                  setExpandedId(expanded ? cycle.id : "none")
                }
                variant="outlined"
                sx={{ border: 0, borderBottom: 1, borderColor: "divider", borderRadius: 0 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{
                      width: "100%",
                      pr: 1,
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                    >
                      {formatCycleTime(cycle.at)}
                    </Typography>
                    <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1 }}>
                      {multiServer && (
                        <Chip size="small" variant="outlined" label={cycle.serverHost} />
                      )}
                      <Chip
                        size="small"
                        color={cycle.linesSelected > 0 ? "success" : "default"}
                        variant="outlined"
                        label={`${cycle.linesSelected} lines`}
                      />
                      <Chip
                        size="small"
                        color="info"
                        variant="outlined"
                        label={`${cycle.changedCount ?? cycle.changedFiles.length} changed`}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`${cycle.unchangedCount ?? cycle.unchangedFiles.length} unchanged`}
                      />
                    </Stack>
                  </Stack>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="overline" color="primary">
                        Changed ({cycle.changedCount ?? cycle.changedFiles.length})
                      </Typography>
                      <FileNames
                        files={cycle.changedFiles}
                        serverHost={cycle.serverHost}
                        multiServer={multiServer}
                        empty="No files changed in this cycle."
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="overline" color="text.secondary">
                        Unchanged (
                        {cycle.unchangedCount ?? cycle.unchangedFiles.length})
                      </Typography>
                      <FileNames
                        files={cycle.unchangedFiles}
                        serverHost={cycle.serverHost}
                        multiServer={multiServer}
                        empty={`${cycle.unchangedCount ?? 0} files unchanged.`}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Box>
    </Card>
  );
}

"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { formatChartStamp } from "@/lib/chart-stamp";

type ChartStampProps = {
  at?: number;
};

export function ChartStamp({ at }: ChartStampProps) {
  const sx = {
    flexShrink: 0,
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    fontSize: 11,
    color: "text.disabled",
  };

  if (!at) {
    return (
      <Typography component="span" sx={sx}>
        No new data
      </Typography>
    );
  }

  const date = new Date(at);
  return (
    <Typography
      component="time"
      dateTime={date.toISOString()}
      title={`New data arrived ${date.toLocaleString(undefined, { hour12: false })}`}
      suppressHydrationWarning
      sx={sx}
    >
      New data {formatChartStamp(at)}
    </Typography>
  );
}

type ChartHeaderProps = {
  title: string;
  description?: ReactNode;
  arrivedAt?: number;
  titleAs?: "h2" | "h3";
};

export function ChartHeader({
  title,
  description,
  arrivedAt,
  titleAs: TitleTag = "h2",
}: ChartHeaderProps) {
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        direction="row"
        useFlexGap
        sx={{ justifyContent: "space-between", alignItems: "flex-start", gap: 1.5 }}
      >
        <Typography
          component={TitleTag}
          variant={TitleTag === "h3" ? "caption" : "body2"}
          sx={{ fontWeight: 500, color: TitleTag === "h3" ? "text.secondary" : "text.primary" }}
        >
          {title}
        </Typography>
        <ChartStamp at={arrivedAt} />
      </Stack>
      {description ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

type ChartCardProps = {
  title: string;
  description?: ReactNode;
  arrivedAt?: number;
  children: ReactNode;
};

export function ChartCard({
  title,
  description,
  arrivedAt,
  children,
}: ChartCardProps) {
  return (
    <Card>
      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
        <ChartHeader title={title} description={description} arrivedAt={arrivedAt} />
        {children}
      </CardContent>
    </Card>
  );
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex",
        height: 256,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}

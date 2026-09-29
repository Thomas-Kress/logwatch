import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import type { ReactNode } from "react";

type PanelCardProps = {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  height?: number | string;
  maxHeight?: number | string;
  minHeight?: number | string;
  id?: string;
};

export function PanelCard({
  title,
  action,
  children,
  height,
  maxHeight,
  minHeight,
  id,
}: PanelCardProps) {
  return (
    <Card
      id={id}
      sx={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height,
        maxHeight,
        minHeight,
      }}
    >
      <CardHeader
        title={title}
        action={action}
        sx={{
          py: 1.5,
          px: 2,
          "& .MuiCardHeader-title": { fontSize: 14, fontWeight: 500 },
          "& .MuiCardHeader-action": { m: 0, alignSelf: "center" },
        }}
      />
      <Divider />
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</Box>
    </Card>
  );
}

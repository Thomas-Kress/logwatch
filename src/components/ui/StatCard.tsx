import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  valueColor?: string;
};

export function StatCard({ label, value, icon, valueColor }: StatCardProps) {
  return (
    <Card>
      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          {icon}
        </Stack>
        <Typography
          variant="h4"
          sx={{
            mt: 1.5,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: valueColor,
          }}
        >
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

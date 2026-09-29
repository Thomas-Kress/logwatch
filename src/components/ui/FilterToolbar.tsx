import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";

type FilterToolbarProps = {
  label: string;
  children: ReactNode;
};

export function FilterToolbar({ label, children }: FilterToolbarProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ mr: 1, fontWeight: 500 }}>
          {label}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

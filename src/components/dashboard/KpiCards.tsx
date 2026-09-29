import DescriptionIcon from "@mui/icons-material/Description";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import NotificationsIcon from "@mui/icons-material/Notifications";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Grid from "@mui/material/Grid";
import { StatCard } from "@/components/ui/StatCard";

export type KpiValues = {
  files: number;
  rate: number;
  warnings: number;
  errors: number;
  alerts: number;
};

const cards = [
  {
    key: "files",
    label: "Files in view",
    icon: DescriptionIcon,
    color: "info.main",
  },
  {
    key: "rate",
    label: "Lines / min",
    icon: ShowChartIcon,
    color: "success.main",
  },
  {
    key: "warnings",
    label: "Warnings",
    icon: WarningAmberIcon,
    color: "warning.main",
  },
  {
    key: "errors",
    label: "Errors",
    icon: ErrorOutlineOutlinedIcon,
    color: "error.main",
  },
  {
    key: "alerts",
    label: "Active alerts",
    icon: NotificationsIcon,
    color: "secondary.main",
  },
] as const;

export function KpiCards({ values }: { values: KpiValues }) {
  return (
    <Grid container spacing={1.5}>
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Grid key={card.key} size={{ xs: 12, sm: 6, xl: "grow" }}>
            <StatCard
              label={card.label}
              value={values[card.key]}
              icon={<Icon fontSize="small" sx={{ color: card.color }} />}
            />
          </Grid>
        );
      })}
    </Grid>
  );
}

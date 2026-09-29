import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PanelCard } from "@/components/ui/PanelCard";
import type { Alert, DashboardFilters } from "@/lib/types";

type AlertListProps = {
  alerts: Alert[];
  onFilter: (patch: Partial<DashboardFilters>) => void;
};

export function AlertList({ alerts, onFilter }: AlertListProps) {
  return (
    <PanelCard
      height={320}
      title="Alerts"
      action={
        <Typography variant="caption" color="text.secondary">
          {alerts.length} active
        </Typography>
      }
    >
      {alerts.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
          No alerts. Thresholds come from `.env` (`ALERT_ERROR_PER_MIN`,
          `ALERT_WARN_PER_MIN`).
        </Typography>
      ) : (
        <List disablePadding>
          {alerts.map((alert) => (
            <ListItemButton
              key={alert.id}
              divider
              onClick={() =>
                onFilter({
                  file: alert.file ?? "",
                  messageId: alert.messageId ?? "",
                  severity: alert.level === "critical" ? "error" : "warn",
                })
              }
            >
              <ListItemText
                primary={
                  <Stack
                    direction="row"
                    useFlexGap
                    sx={{ justifyContent: "space-between", gap: 1, mb: 0.5 }}
                  >
                    <Chip
                      size="small"
                      color={alert.level === "critical" ? "error" : "warning"}
                      label={alert.level}
                      sx={{ textTransform: "uppercase" }}
                    />
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}
                    >
                      ×{alert.count}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <>
                    <Typography variant="body2" color="text.primary">
                      {alert.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                      {alert.detail}
                    </Typography>
                  </>
                }
                slotProps={{
                  primary: { component: "div" },
                  secondary: { component: "div" },
                }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </PanelCard>
  );
}

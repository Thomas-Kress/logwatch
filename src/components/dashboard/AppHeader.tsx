"use client";

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CheckIcon from "@mui/icons-material/Check";
import DashboardIcon from "@mui/icons-material/Dashboard";
import DnsIcon from "@mui/icons-material/Dns";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import SensorsIcon from "@mui/icons-material/Sensors";
import StorageIcon from "@mui/icons-material/Storage";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { useId, useState, type MouseEvent } from "react";
import type { ConnectionStatus, ServerSnapshot } from "@/lib/types";

export type DashboardView =
  | "overview"
  | "slowdb"
  | "activations"
  | "processes";

const VIEWS = [
  { id: "overview", label: "Overview", icon: DashboardIcon },
  { id: "slowdb", label: "Performance Metrics", icon: StorageIcon },
  { id: "activations", label: "Activities", icon: AutoAwesomeIcon },
  { id: "processes", label: "Processes", icon: DnsIcon },
] as const;

type AppHeaderProps = {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  status: ConnectionStatus;
  statusLabel: string;
  hostLabel: string;
  path?: string;
  pattern?: string;
  generatedAt?: number;
  servers: ServerSnapshot[];
  multiServer: boolean;
  connected: boolean;
  showProcesses?: boolean;
  showHealthLog?: boolean;
  onToggleHealthLog?: () => void;
  historyCollectionDays?: number;
};

function serverChipColor(status?: ConnectionStatus) {
  if (status === "live") {
    return "success" as const;
  }
  if (status === "connecting") {
    return "info" as const;
  }
  if (status === "error") {
    return "error" as const;
  }
  return "default" as const;
}

export function AppHeader({
  view,
  onViewChange,
  status,
  statusLabel,
  hostLabel,
  path,
  pattern,
  generatedAt,
  servers,
  multiServer,
  connected,
  showProcesses = true,
  showHealthLog = false,
  onToggleHealthLog,
  historyCollectionDays = 7,
}: AppHeaderProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const views = VIEWS.filter((item) => item.id !== "processes" || showProcesses);
  const currentView = views.find((item) => item.id === view) ?? views[0];
  const CurrentIcon = currentView.icon;
  const menuOpen = Boolean(menuAnchor);
  const partialLive =
    status === "live" &&
    multiServer &&
    servers.some((server) => server.status !== "live");

  const openMenu = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
  };

  return (
    <AppBar position="sticky">
      <Container maxWidth={false} sx={{ maxWidth: 1280, px: { xs: 2, sm: 3 } }}>
        <Toolbar
          disableGutters
          sx={{
            minHeight: { xs: 64 },
            py: 1.5,
            gap: 2,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="overline"
              color="primary"
              sx={{ letterSpacing: "0.2em", lineHeight: 1.2 }}
            >
              Logwatch
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {connected
                ? `${hostLabel} · ${path} · ${pattern}${
                    generatedAt
                      ? ` · updated ${new Date(generatedAt).toLocaleTimeString(undefined, { hour12: false })}`
                      : ""
                  }`
                : "Reading .env and opening SSH…"}
            </Typography>
            {multiServer && (
              <Stack direction="row" useFlexGap sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                {servers.map((server) => (
                  <Chip
                    key={server.id}
                    size="small"
                    color={serverChipColor(server.status)}
                    variant="outlined"
                    label={
                      server.status === "live"
                        ? server.host
                        : `${server.host} · ${server.status}`
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", gap: 1.5 }}>
            <Button
              variant="outlined"
              color="inherit"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={openMenu}
              startIcon={<CurrentIcon fontSize="small" />}
              endIcon={
                <ExpandMoreIcon
                  fontSize="small"
                  sx={{
                    transition: "transform 0.2s",
                    transform: menuOpen ? "rotate(180deg)" : "none",
                  }}
                />
              }
            >
              {currentView.label}
            </Button>
            <Menu
              id={menuId}
              anchorEl={menuAnchor}
              open={menuOpen}
              onClose={closeMenu}
              slotProps={{ paper: { sx: { minWidth: 224 } } }}
            >
              {views.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <MenuItem
                    key={item.id}
                    selected={active}
                    onClick={() => {
                      onViewChange(item.id);
                      closeMenu();
                    }}
                  >
                    <ListItemIcon>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{item.label}</ListItemText>
                    {active ? <CheckIcon fontSize="small" color="primary" /> : null}
                  </MenuItem>
                );
              })}
            </Menu>
            <Tooltip
              title={`Collect last ${historyCollectionDays} day${
                historyCollectionDays === 1 ? "" : "s"
              }`}
            >
              <IconButton
                color="inherit"
                size="small"
                aria-label={`Collect last ${historyCollectionDays} day${
                  historyCollectionDays === 1 ? "" : "s"
                }`}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {onToggleHealthLog && (
              <Button
                variant={showHealthLog ? "contained" : "outlined"}
                color={showHealthLog ? "primary" : "inherit"}
                onClick={onToggleHealthLog}
                aria-pressed={showHealthLog}
                aria-controls={showHealthLog ? "health-log" : undefined}
                startIcon={<MonitorHeartIcon fontSize="small" />}
              >
                Health
              </Button>
            )}
            <Chip
              icon={<SensorsIcon />}
              color={
                status === "live"
                  ? partialLive
                    ? "warning"
                    : "success"
                  : status === "connecting"
                    ? "info"
                    : status === "error"
                      ? "error"
                      : "default"
              }
              variant="outlined"
              label={statusLabel}
            />
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PanelCard } from "@/components/ui/PanelCard";
import { DATA_WINDOW_DAYS } from "@/lib/data-window";
import type { WatchedFile } from "@/lib/types";
import { fileLabel } from "@/lib/utils";

type FileListProps = {
  files: WatchedFile[];
  selected: string;
  multiServer?: boolean;
  onSelect: (name: string) => void;
};

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({
  files,
  selected,
  multiServer = false,
  onSelect,
}: FileListProps) {
  return (
    <PanelCard
      height={320}
      title="Log files"
      action={
        <Typography variant="caption" color="text.secondary">
          {files.length} in last {DATA_WINDOW_DAYS} days
        </Typography>
      }
    >
      <List disablePadding>
        <ListItemButton selected={selected === ""} onClick={() => onSelect("")}>
          <ListItemText primary="All files" />
        </ListItemButton>
        {files.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3 }}>
            No files match the current filters.
          </Typography>
        ) : (
          files.map((file) => (
            <ListItemButton
              key={file.id}
              selected={selected === file.id}
              onClick={() => onSelect(file.id)}
            >
              <ListItemText
                primary={fileLabel(file.name, file.serverHost, multiServer)}
                secondary={`${multiServer ? `${file.serverHost} · ` : ""}${file.role}${
                  file.instance ? ` ${file.instance}` : ""
                } · ${formatSize(file.size)}`}
                slotProps={{
                  primary: {
                    noWrap: true,
                    sx: {
                      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    },
                  },
                }}
              />
              <Stack sx={{ ml: 1, flexShrink: 0, alignItems: "flex-end" }}>
                {file.errors > 0 && (
                  <Typography variant="caption" color="error">
                    {file.errors} err
                  </Typography>
                )}
                {file.warnings > 0 && (
                  <Typography variant="caption" color="warning">
                    {file.warnings} warn
                  </Typography>
                )}
              </Stack>
            </ListItemButton>
          ))
        )}
      </List>
    </PanelCard>
  );
}

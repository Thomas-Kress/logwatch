import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "dark",
    primary: { main: "#38bdf8" },
    secondary: { main: "#818cf8" },
    error: { main: "#f87171" },
    warning: { main: "#fbbf24" },
    success: { main: "#34d399" },
    info: { main: "#38bdf8" },
    background: {
      default: "#09090b",
      paper: "#18181b",
    },
    divider: "#27272a",
    text: {
      primary: "#fafafa",
      secondary: "#a1a1aa",
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
    button: { textTransform: "none", fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarWidth: "thin",
          scrollbarColor: "#3f3f46 transparent",
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
    },
    MuiAppBar: {
      defaultProps: { color: "inherit", elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(9, 9, 11, 0.92)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #27272a",
        },
      },
    },
    MuiButton: {
      defaultProps: { size: "small" },
    },
    MuiTextField: {
      defaultProps: { size: "small" },
    },
    MuiSelect: {
      defaultProps: { size: "small" },
    },
    MuiChip: {
      defaultProps: { size: "small" },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
    MuiAccordion: {
      defaultProps: { disableGutters: true, square: true },
      styleOverrides: {
        root: {
          backgroundImage: "none",
          "&:before": { display: "none" },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          alignItems: "flex-start",
        },
      },
    },
  },
});

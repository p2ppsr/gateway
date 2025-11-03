/**
 * @file src/components/Theme.tsx
 * @desciption
 * Provides a reusable `ThemeWrapper` component that applies a customized MUI theme
 * (light or dark) across the app. This file defines the base light and dark themes,
 * extends them with responsive typography and reusable layout templates, and wraps
 * the app with a `ThemeProvider` and global `CssBaseline` reset.
 * - Font: Inter (updated from Satoshi per UI teammate's notes)
 * - Color modes: light and dark
 * - Responsive scaling of headers (h1, h2)
 * - Custom template styles: `page_wrap`, `subheading`, `centeredHeader`, etc.
 * Used as the top-level theme wrapper in the application root.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import React, { ReactNode, useMemo, useState } from "react";
import { createTheme, ThemeProvider, CssBaseline } from "@mui/material";
import { Theme } from "@mui/material/styles";

/**
 * Common typography settings applied to both light and dark themes.
 */
const commonTypography = {
  fontFamily: "Inter, sans-serif", // Updated from Satoshi per UI teammate's notes
};

/**
 * Base light mode MUI theme configuration.
 */
const lightThemeBase = createTheme({
  spacing: 8,
  typography: {
    ...commonTypography,
    h1: { fontSize: "2.25rem", fontWeight: 700 }, // 36px, per UI notes
    h2: { fontSize: "1.5rem", fontWeight: 600 }, // 24px, per UI notes
    h3: { fontSize: "1.25rem", fontWeight: 600 }, // 20px, per UI notes
    h4: { fontSize: "1.75em", color: "#424242" },
    h5: { fontSize: "1.5em", color: "#424242" },
    h6: { fontSize: "1.25em", color: "#424242" },
  },
  palette: {
    mode: "light",
    primary: { main: "#3f51b5", light: "#7986cb" }, // UI teammate's purple accent
    background: { default: "#ffffff", paper: "#ffffff" }, // Adjusted to light mode defaults
    text: { primary: "#424242", secondary: "#94A3B8" }, // UI teammate's text colors
    divider: "#3E3E42", // UI teammate's divider
  },
  maxContentWidth: "1440px",
});

/**
 * Base dark mode MUI theme configuration.
 */
const darkThemeBase = createTheme({
  spacing: 8,
  typography: {
    ...commonTypography,
    h1: { fontSize: "2.25rem", fontWeight: 700 }, // 36px, per UI notes
    h2: { fontSize: "1.5rem", fontWeight: 600 }, // 24px, per UI notes
    h3: { fontSize: "1.25rem", fontWeight: 600 }, // 20px, per UI notes
    h4: { fontSize: "1.75em", color: "#F2F2F2" },
    h5: { fontSize: "1.5em", color: "#F2F2F2" },
    h6: { fontSize: "1.25em", color: "#F2F2F2" },
  },
  palette: {
    mode: "dark",
    primary: { main: "#3f51b5", light: "#7986cb" }, // UI teammate's purple accent
    background: { default: "#1C1C1F", paper: "#2A2A2E" }, // UI teammate's dark mode
    text: { primary: "#F2F2F2", secondary: "#94A3B8" }, // UI teammate's text colors
    divider: "#3E3E42", // UI teammate's divider
  },
  maxContentWidth: "1440px",
});

/**
 * Extends the base theme with custom responsive typography and template styles.
 *
 * @param baseTheme The base MUI theme (light or dark).
 * @returns Extended theme object with custom typography and templates.
 */
const extendedTheme = (baseTheme: Theme): Theme => ({
  ...baseTheme,
  typography: {
    ...baseTheme.typography,
    h1: {
      ...baseTheme.typography.h1,
      [baseTheme.breakpoints.down("md")]: { fontSize: "1.8em" },
    },
    h2: {
      ...baseTheme.typography.h2,
      [baseTheme.breakpoints.down("md")]: { fontSize: "1.6em" },
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
          padding: "10px 24px",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: "24px",
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: baseTheme.palette.mode === "dark" ? "#fff" : undefined,
          "&.Mui-checked": {
            color: baseTheme.palette.mode === "dark" ? "#fff" : undefined,
          },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: baseTheme.palette.mode === "dark" ? "#fff" : undefined,
          "&.Mui-checked": {
            color: baseTheme.palette.mode === "dark" ? "#fff" : undefined,
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          marginTop: baseTheme.spacing(2),
        },
      },
      defaultProps: {
        variant: "outlined", // All text fields will be the same style by default
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: "#333337",
          fontWeight: 600,
          color: "#94A3B8",
        },
      },
    },
  },
  templates: {
    page_wrap: {
      maxWidth: `min(${baseTheme.maxContentWidth ?? "1440px"}, 100vw)`,
      margin: "auto",
      boxSizing: "border-box",
      padding: baseTheme.spacing(7),
      [baseTheme.breakpoints.down("lg")]: { padding: baseTheme.spacing(5) },
      [baseTheme.breakpoints.down("md")]: { padding: baseTheme.spacing(3) },
      [baseTheme.breakpoints.down("sm")]: { padding: baseTheme.spacing(1) },
    },
    subheading: {
      fontWeight: "bold",
      fontSize: "24px",
      width: "90%",
      maxWidth: "600px",
      color: baseTheme.palette.mode === "dark" ? "#FFF" : "#424242",
      textAlign: "center",
      margin: "auto",
      [baseTheme.breakpoints.up("lg")]: { fontSize: "32px" },
    },
    subheading_f: {
      fontWeight: "bold",
      fontSize: "24px",
      width: "90%",
      color: baseTheme.palette.mode === "dark" ? "#FFF" : "#424242",
      maxWidth: "600px",
      textAlign: "left",
      [baseTheme.breakpoints.up("lg")]: { fontSize: "32px" },
    },
    centeredHeader: {
      textAlign: "center",
      marginBottom: baseTheme.spacing(7),
      color: baseTheme.palette.mode === "dark" ? "#ffffff" : "#000000",
    },
  },
});

/**
 * `ThemeWrapper` is a React component that wraps children in an MUI `ThemeProvider`
 * with custom light and dark theme support, defaulting to dark mode.
 *
 * - Provides global `CssBaseline` reset.
 * - Applies responsive typography and layout templates.
 * - Switchable via internal `mode` state (currently fixed to "dark").
 *
 * @param children - React children to wrap in the themed layout.
 * @returns Themed UI container with children rendered inside.
 */
const ThemeWrapper = ({ children }: { children: ReactNode }): JSX.Element => {
  const [mode] = useState<"light" | "dark">("dark"); // Default to dark per UI teammate's notes
  const theme = useMemo(
    () => extendedTheme(mode === "light" ? lightThemeBase : darkThemeBase),
    [mode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
};

export default ThemeWrapper;

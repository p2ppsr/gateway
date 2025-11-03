/**
 * @file src/utils/logging.ts
 * @description
 * Provides logging utilities with performance metrics for the Gateway application.
 * - Tracks elapsed time between log statements using performance.now().
 * - Detects truecolor support for colored output based on the COLORTERM environment variable.
 * - Loads logging configuration from logging.config.ts with fallback to default settings if the config file fails.
 * - Colorizes log timestamps based on elapsed time (red > 1s, orange > 0.5s, yellow > 0.3s, default otherwise).
 * - Supports file-specific logging enablement/disablement via configuration.
 * - Updated to safely handle objects with JSON.stringify, falling back to util.inspect for circular references (v1.2.2).
 * Intended to help diagnose performance issues across the application.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

import util from "util";

let lastLogTime = performance.now();
// Detect truecolor support
const supportsTruecolor = process.env.COLORTERM === "truecolor";
// Import logging configuration with error handling
let loggingConfig: { [file: string]: boolean } = { default: true };
try {
  loggingConfig = require("./logging.config").default || { default: true };
} catch (e) {
  console.warn("Failed to load logging.config.ts, using default settings:", e);
}
const colorize = (elapsed: number) => {
  if (elapsed > 1.0) {
    return supportsTruecolor
      ? "\x1b[38;2;255;0;0m" // red
      : "\x1b[31m"; // ANSI red
  } else if (elapsed > 0.5) {
    return supportsTruecolor
      ? "\x1b[38;2;255;165;0m" // orange
      : "\x1b[33;1m"; // bright yellow as orange
  } else if (elapsed > 0.3) {
    return supportsTruecolor
      ? "\x1b[38;2;255;255;0m" // yellow
      : "\x1b[33m"; // ANSI yellow
  } else {
    return "\x1b[0m"; // default
  }
};

export const logWithTimestamp = (
  file: string = "unknown",
  message: any = "No message",
  ...args: any[]
) => {
  // Check if logging is enabled for this file (fall back to default if not set)
  const isEnabled =
    loggingConfig[file] !== undefined
      ? loggingConfig[file]
      : loggingConfig.default;
  if (!isEnabled) return;

  const now = performance.now();
  const elapsedSec = (now - lastLogTime) / 1000;
  lastLogTime = now;

  const timestamp = new Date().toISOString();
  const elapsed = elapsedSec.toFixed(3);
  const color = colorize(elapsedSec);

  // Safely format values (handles objects and circular references)
  const safeFormat = (val: any) => {
    if (typeof val === "object" && val !== null) {
      try {
        return JSON.stringify(val, null, 2);
      } catch (e) {
        return util.inspect(val, { depth: 2, colors: true });
      }
    }
    return val;
  };

  const formattedMessage = safeFormat(message);
  const formattedArgs = args.map(safeFormat);

  // Construct the log line
  const logMessage = `[${timestamp}] ${color}[${elapsed}s]\x1b[0m [${file}]`;

  console.log(logMessage, formattedMessage, ...formattedArgs);
};

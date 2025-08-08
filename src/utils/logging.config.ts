// Default logging state for all files
const defaultLogging = false

// Specific file logging overrides
const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  'pages/Create': false,
  'pages/Buttons': false,
  'pages/Actions': false,
  'pages/Money': false,
  'pages/Payments': false
}

export default loggingConfig

// Default logging state for all files
const defaultLogging = false

// Specific file logging overrides
const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  'pages/Create': true,
  'pages/Buttons': true,
  'pages/Actions': false,
  'pages/Money': false,
  'pages/Payments': true,
  'routes/createButton': true,
  'routes/buttonCode': true,
  'routes/initializeIds': true,
  'routes/invoice': true,
  'routes/pay': true,
  'routes/listButtons': true,
  'routes/listPayments': true,
  'utils/initializeIds': true,
  index: true,
  inject: true,
  server: true
}

export default loggingConfig

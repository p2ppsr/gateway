// Default logging state for all files
const defaultLogging = false;

// Specific file logging overrides
const loggingConfig: { [file: string]: boolean } = {
  default: defaultLogging,
  "utils/scriptingOrigin": false,
  "demo/demoIdsAuth": false,
  "pages/Create": false,
  "pages/Buttons": false,
  "pages/Actions": false,
  "pages/Money": false,
  "pages/Payments": true,
  "routes/acknowledgePayment": true,
  "routes/createButton": false,
  "routes/buttonCode": false,
  "routes/initializeIds": false,
  "routes/invoice": true,
  "routes/pay": true,
  "routes/listButtons": false,
  "routes/listPayments": false,
  "utils/initializeIds": false,
  index: false,
  inject: false,
  server: false,
};

export default loggingConfig;

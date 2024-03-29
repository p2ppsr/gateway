interface Constants {
  confederacyURL?: string
  nanostoreURL: string
  tempoTopic: string
  tspProtocolID: string
  keyServerURL: string
  RETENTION_PERIOD?: number
}

let constants: Constants

if (
  window.location.host.startsWith("localhost") ||
  process.env.NODE_ENV === "development"
) {
  // local
  constants = {
    confederacyURL: "https://staging-confederacy.babbage.systems", //'http://localhost:3103',
    nanostoreURL: "https://staging-nanostore.babbage.systems", //'http://localhost:3104',
    tempoTopic: "TSP",
    tspProtocolID: "1LQtKKK7c1TN3UcRfsp8SqGjWtzGskze36",
    keyServerURL:
      process.env.REACT_APP_TEMPO_KEY_SERVER_URL ||
      "https://staging-tempo-keyserver.babbage.systems", //'http://localhost:8080'
  }

} else if (window.location.host.startsWith("staging")) {
  // staging
  constants = {
    confederacyURL: "https://staging-confederacy.babbage.systems",
    nanostoreURL: "https://staging-nanostore.babbage.systems",
    tempoTopic: "TSP",
    tspProtocolID: "1LQtKKK7c1TN3UcRfsp8SqGjWtzGskze36",
    keyServerURL:
      process.env.REACT_APP_TEMPO_KEY_SERVER_URL ||
      "https://staging-tempo-keyserver.babbage.systems",
  }

} else {
  // production
  constants = {
    confederacyURL: 'https://confederacy.babbage.systems', // TODO: this should not be undefined or default "https://production-confederacy.babbage.systems"
    nanostoreURL: "https://nanostore.babbage.systems",
    tempoTopic: "TSP",
    tspProtocolID: "1LQtKKK7c1TN3UcRfsp8SqGjWtzGskze36",
    keyServerURL:
      process.env.REACT_APP_TEMPO_KEY_SERVER_URL ||
      "https://tempo-keyserver.babbage.systems",
  }
}

// Debugging / development:
// constants = {
//   bridgeportResolvers: ['https://staging-bridgeport.babbage.systems'],
//   nanostoreURL: 'https://staging-nanostore.babbage.systems',
//   tempoBridge: '1LQtKKK7c1TN3UcRfsp8SqGjWtzGskze36',
//   keyServerURL: 'http://localhost:8080'
// }

// constants.nanostoreURL = "https://staging-nanostore.babbage.systems"

// Uploaded songs will be hosted for seven years
constants.RETENTION_PERIOD = 60 * 24 * 365 * 7

export default constants

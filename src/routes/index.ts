const get = (m: any) => (m && m.default ? m.default : m)

export default [
  get(require('./getStatus')),
  get(require('./createButton')),
  get(require('./invoice')),
  get(require('./pay')),
  get(require('./listPayments')),
  get(require('./listButtons')),
  get(require('./acknowledgePayment'))
]

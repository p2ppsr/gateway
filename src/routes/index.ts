module.exports = [
  {
    type: 'get',
    path: '/getStatus',
    func: require('./getStatus')
  },
  {
    type: 'post',
    path: '/createButton',
    func: require('./createButton')
  },
  {
    type: 'post',
    path: '/invoice',
    func: require('./invoice')
  },
  {
    type: 'post',
    path: '/pay',
    func: require('./pay')
  },
  {
    type: 'get',
    path: '/listPayments',
    func: require('./listPayments')
  },
  {
    type: 'get',
    path: '/listButtons',
    func: require('./listButtons')
  },
  {
    type: 'post',
    path: '/acknowledgePayment',
    func: require('./acknowledgePayment')
  }
]

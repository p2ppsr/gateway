import { WalletClient } from '@bsv/sdk'

/*
  Check if the MetaNet Client is running, and, if so, if it's on mainnet or testnet

  @returns 1 for mainnet, -1 for testnet, 0 for an error (i.e. indicating MNC isn't running)
*/
export default async (walletOrigin: string): Promise<number> => {
  try {
    const { network } = await new WalletClient('auto', walletOrigin).getNetwork()
    console.log('network=', network)
    if (network === 'mainnet') {
      return 1
    } else {
      return -1
    }
  } catch (error) {
    return 0
  }
}
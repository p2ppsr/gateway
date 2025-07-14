declare module '@bsv/sdk' {
  interface WalletInterface {
    signAction: (...args: any[]) => Promise<any>
    acquireCertificate: (...args: any[]) => Promise<any>
    proveCertificate: (...args: any[]) => Promise<any>
  }
  interface SignActionArgs {
    spends: Record<number, { unlockingScript: string; sequenceNumber?: number }>
    reference: string
    options?: any // Relax type to suppress sendWith error
  }
  interface AcquireCertificateArgs {
    type: string
    subject?: any // Relax type to allow undefined
    serialNumber: string
    revocationOutpoint: string
    signature: string
    fields: Record<string, string>
    certifier: string
    keyringRevealer: string
    keyringForSubject: Record<string, string>
    acquisitionProtocol: 'direct' | 'issuance'
    certifierUrl?: string
  }
  interface ProveCertificateArgs {
    certificate: {
      type?: any // Relax type to allow undefined
      subject: string
      serialNumber: string
      certifier: string
      revocationOutpoint: string
      signature: string
      fields: Record<string, string>
    }
    fieldsToReveal: string[]
    verifier: string
    privileged?: boolean
    privilegedReason?: string
  }
}

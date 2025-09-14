/**
 * @file src/types.d.ts
 * @description
 * TypeScript module augmentation for `@bsv/sdk`, extending the `WalletInterface`
 * with custom methods and defining argument types for new SDK features such as
 * signAction, acquireCertificate, and proveCertificate.
 */

declare module '@bsv/sdk' {
  /**
   * Extension of the WalletInterface to include custom methods for signing actions
   * and working with certificates.
   *
   * @property {Function} signAction - Signs an action given specific inputs.
   * @property {Function} acquireCertificate - Requests issuance of a new certificate.
   * @property {Function} proveCertificate - Generates a proof of certificate with selected fields revealed.
   */
  interface WalletInterface {
    signAction: (...args: any[]) => Promise<any>
    acquireCertificate: (...args: any[]) => Promise<any>
    proveCertificate: (...args: any[]) => Promise<any>
  }

  /**
   * Arguments used when calling `signAction` from a WalletClient.
   *
   * @property {Record<number, { unlockingScript: string; sequenceNumber?: number }>} spends - Mapping of input index to unlocking script and optional sequence number.
   * @property {string} reference - Unique reference string for tracking the action.
   * @property {any} [options] - Optional configuration for the signing process.
   */
  interface SignActionArgs {
    spends: Record<number, { unlockingScript: string; sequenceNumber?: number }>
    reference: string
    options?: any
  }

  /**
   * Arguments required to acquire a certificate from a certifying authority.
   *
   * @property {string} type - Type or classification of the certificate.
   * @property {any} [subject] - Optional subject data (can be undefined).
   * @property {string} serialNumber - Unique serial number identifying the certificate.
   * @property {string} revocationOutpoint - Outpoint used for revocation tracking.
   * @property {string} signature - Signature from the certifier to authorize issuance.
   * @property {Record<string, string>} fields - Data fields included in the certificate.
   * @property {string} certifier - Identifier of the issuing certifier.
   * @property {string} keyringRevealer - Revealer key for encrypted field access.
   * @property {Record<string, string>} keyringForSubject - Keyring for the certificate subject.
   * @property {'direct' | 'issuance'} acquisitionProtocol - Protocol used to acquire the certificate.
   * @property {string} [certifierUrl] - Optional URL to the certifier's API or service.
   */
  interface AcquireCertificateArgs {
    type: string
    subject?: any
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

  /**
   * Arguments required to prove ownership or validity of a certificate.
   *
   * @property {object} certificate - The certificate being proven.
   * @property {any} [certificate.type] - Optional type field (may be undefined).
   * @property {string} certificate.subject - Subject of the certificate.
   * @property {string} certificate.serialNumber - Serial number of the certificate.
   * @property {string} certificate.certifier - Certifier who issued the certificate.
   * @property {string} certificate.revocationOutpoint - Outpoint to track revocation.
   * @property {string} certificate.signature - Signature that validates the certificate.
   * @property {Record<string, string>} certificate.fields - Key-value data fields within the certificate.
   * @property {string[]} fieldsToReveal - List of certificate fields to include in the proof.
   * @property {string} verifier - Verifying party or service.
   * @property {boolean} [privileged] - Whether the proof is privileged.
   * @property {string} [privilegedReason] - Reason for privileged proof if applicable.
   */
  interface ProveCertificateArgs {
    certificate: {
      type?: any
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

declare const __SERVER_IDENTITY_KEY__: string;

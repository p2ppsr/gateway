/**
 * @file src/components/MetanetclientModal.tsx
 *
 * Displays a platform-specific modal prompting the user to install the Metanet client.
 *
 * Depending on the provided `platformLabel`, this modal adjusts to:
 * - Show "Metanet Mobile" with a QR code for Android/iOS.
 * - Show "Metanet Desktop" without a QR code for other platforms.
 *
 * It includes a direct download link, a fallback to all client releases, and styled
 * layout using MUI and `react-qr-code`.
 */

import React from 'react'
import { Typography, Link, Box } from '@mui/material'
import QRCode from 'react-qr-code'

/**
 * Props for the `MetanetclientModal` component.
 *
 * @property {string} downloadURL - Direct download URL for the Metanet client.
 * @property {string} platformLabel - Human-readable platform label ("Android", "iOS", "macOS", etc.).
 */
interface Props {
  downloadURL: string
  platformLabel: string
}

/**
 * `MetanetclientModal` is a centered modal UI element that:
 * - Displays a message that Gateway requires the Metanet client.
 * - Provides a platform-specific download link.
 * - Shows a link to all client releases.
 * - Displays a QR code for mobile users to scan the download URL.
 *
 * The modal dynamically adjusts content based on the platform:
 * - If `platformLabel` is "Android" or "iOS", the client is labeled "Metanet Mobile"
 *   and a QR code is rendered.
 * - Otherwise, it's labeled "Metanet Desktop" with no QR code.
 *
 * @param {Props} props - The `downloadURL` and `platformLabel` to display.
 * @returns {JSX.Element} The rendered modal component.
 */
const MetanetclientModal: React.FC<Props> = ({
  downloadURL,
  platformLabel
}) => {
  const isMobile = platformLabel === 'Android' || platformLabel === 'iOS'
  const clientType = isMobile ? 'Metanet Mobile' : 'Metanet Desktop'

  return (
    <Box
      sx={{
        bgcolor: '#111',
        border: '1px solid #555',
        borderRadius: '12px',
        p: 4,
        textAlign: 'center',
        maxWidth: 400,
        color: '#fff',
        boxShadow: 5
      }}
    >
      <Typography variant="h6" fontWeight="bold" gutterBottom>
        Gateway requires the {clientType}
      </Typography>

      <Typography gutterBottom>
        You can download it for your{' '}
        <Link
          href={downloadURL}
          underline="hover"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: '#3aa0ff' }}
        >
          {platformLabel}
        </Link>
        :
      </Typography>

      <Typography gutterBottom>
        <Link
          href="https://getMetanet.com"
          underline="hover"
          target="_blank"
          rel="noopener noreferrer"
          sx={{ color: '#3aa0ff' }}
        >
          All Metanet clients
        </Link>
      </Typography>

      {isMobile && (
        <Box mt={3}>
          <QRCode value={downloadURL} size={128} />
        </Box>
      )}
    </Box>
  )
}

export default MetanetclientModal

// src/components/MetanetclientModal.tsx
import React from 'react'
import { Typography, Link, Box } from '@mui/material'
import QRCode from 'react-qr-code'

type Props = {
  downloadURL: string
  platformLabel: string
}

const MetanetclientModal: React.FC<Props> = ({ downloadURL, platformLabel }) => {
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
          href="https://github.com/bsv-blockchain/metanet-desktop/releases"
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

// src/components/MetanetclientMissingModal.tsx
import React from 'react'
import usePlatformDownloadInfo from '../utils/usePlatformDownloadInfo'
import MetanetclientModal from './MetanetClientModal'

type Props = {
  open: boolean
}

const MetanetclientMissingModal: React.FC<Props> = ({ open }) => {
  const info = usePlatformDownloadInfo()

  if (!open || !info) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}
    >
      <MetanetclientModal
        downloadURL={info.downloadURL}
        platformLabel={info.platformLabel}
      />
    </div>
  )
}

export default MetanetclientMissingModal

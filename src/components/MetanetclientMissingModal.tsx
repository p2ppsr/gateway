/**
 * @file src/components/MetanetclientMissingModal.tsx
 *
 * Displays a full-screen blocking modal when the Metanet client is not detected.
 *
 * This component uses `usePlatformDownloadInfo` to determine which platform-specific
 * Metanet client installer to suggest to the user. It renders a translucent overlay
 * with a centered modal if `open` is true and valid download info is available.
 */

import React from 'react'
import usePlatformDownloadInfo from '../utils/usePlatformDownloadInfo'
import MetanetclientModal from './MetanetclientModal'

/**
 * Props for the `MetanetclientMissingModal` component.
 *
 * @property {boolean} open - Whether the modal is currently visible.
 */
interface Props {
  open: boolean
}

/**
 * `MetanetclientMissingModal` is a full-screen overlay that appears
 * when the Metanet client is not detected. It uses platform-specific
 * information to display a modal with the correct download link.
 *
 * The component:
 * - Checks whether it should be open via the `open` prop.
 * - Uses `usePlatformDownloadInfo` to fetch the appropriate download URL and label.
 * - Renders nothing if the modal is not open or platform info is not available.
 * - Displays a dark transparent overlay with a centered `MetanetclientModal`.
 *
 * @param {Props} props - Component props including the `open` flag.
 * @returns {JSX.Element | null} The modal element or null if not active.
 */
const MetanetclientMissingModal: React.FC<Props> = ({ open }) => {
  const info = usePlatformDownloadInfo()

  if (!open || info == null) return null

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

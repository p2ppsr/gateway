/**
 * @file src/utils/usePlatformDownloadInfo.ts
 *
 * A React hook that determines the current platform (iOS, Android, or Web) and provides
 * the appropriate download URL for the Metanet client, using the latest GitHub release info.
 */

import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import getLatestMetanetclientLinks, { MetanetclientLinks } from './getLatestMetanetclientLinks'

/**
 * Represents platform-specific download information for the Metanet client.
 *
 * @typedef {Object} DownloadInfo
 * @property {string} platformLabel - A human-readable label for the detected platform (e.g., "Android", "macOS").
 * @property {string} downloadURL - A direct URL to download the Metanet client for the detected platform.
 */
export type DownloadInfo = {
  platformLabel: string
  downloadURL: string
} | null

/**
 * A React hook that detects the current platform (mobile or web) and fetches the appropriate
 * download link for the Metanet client from the latest GitHub release.
 *
 * For mobile (iOS/Android), returns the corresponding App Store / Play Store link.
 * For web, inspects the user agent to determine macOS, Windows, or Linux platform.
 *
 * @returns {DownloadInfo} An object with `platformLabel` and `downloadURL`, or `null` while loading.
 */
const usePlatformDownloadInfo = (): DownloadInfo => {
  const [info, setInfo] = useState<DownloadInfo>(null)

  useEffect(() => {

    /**
     * Detects the desktop platform using the browser's user agent string.
     *
     * @returns {'macos' | 'windows' | 'linux'} The inferred desktop OS key.
     */
    const detectWebPlatform = (): keyof MetanetclientLinks => {
      const ua = navigator.userAgent || navigator.platform || 'unknown'

      if (/Mac/i.test(ua)) return 'macos'
      if (/Win/i.test(ua)) return 'windows'
      if (/Linux/i.test(ua)) return 'linux'
      return 'macos' // fallback
    }

    /**
     * Fetches the latest Metanet client links and sets the appropriate platform info.
     */
    const fetchDownloadURL = async () => {
      const links: MetanetclientLinks = await getLatestMetanetclientLinks()

      if (Platform.OS === 'ios') {
        setInfo({
          platformLabel: 'iOS',
          downloadURL: links.ios ?? ''
        })
      } else if (Platform.OS === 'android') {
        setInfo({
          platformLabel: 'Android',
          downloadURL: links.android ?? ''
        })
      } else if (Platform.OS === 'web') {
        const desktopOS = detectWebPlatform()
        const labelMap: Record<string, string> = {
          macos: 'macOS',
          windows: 'Windows',
          linux: 'Linux'
        }
        setInfo({
          platformLabel: labelMap[desktopOS] || 'Desktop',
          downloadURL: links[desktopOS] ?? ''
        })
      } else {
        setInfo({
          platformLabel: 'Unknown',
          downloadURL: links.macos ?? ''
        })
      }
    }

    fetchDownloadURL().catch(console.error)
  }, [])

  return info
}

export default usePlatformDownloadInfo

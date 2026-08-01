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
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      const ua = navigator.userAgent || navigator.platform || 'unknown'
      if (typeof ua === 'string' && ua !== '') {
        if (/Mac/i.test(ua)) return 'macos'
        if (/Win/i.test(ua)) return 'windows'
        if (/Linux/i.test(ua)) return 'linux'
      }
      return 'macos' // fallback
    }

    /**
     * Fetches the latest Metanet client links and sets the appropriate platform info.
     */
    const fetchDownloadURL = async (): Promise<void> => {
      try {
        const links: MetanetclientLinks = await getLatestMetanetclientLinks()
        console.log('🔍 Metanet client links:', links)
        console.log('🔍 Platform:', Platform.OS)

        if (typeof Platform.OS === 'string' && (Platform.OS as string) === 'ios') {
          setInfo({
            platformLabel: 'iOS',
            downloadURL: links.ios ?? ''
          })
        } else if (typeof Platform.OS === 'string' && (Platform.OS as string) === 'android') {
          setInfo({
            platformLabel: 'Android',
            downloadURL: links.android ?? ''
          })
        } else if (typeof Platform.OS === 'string' && (Platform.OS as string) === 'web') {
          const desktopOS = detectWebPlatform()
          const labelMap: Record<string, string> = {
            macos: 'macOS',
            windows: 'Windows',
            linux: 'Linux'
          }
          setInfo({
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            platformLabel: labelMap[desktopOS] || 'Desktop',
            downloadURL: links[desktopOS] ?? ''
          })
        } else {
          setInfo({
            platformLabel: 'Unknown',
            downloadURL: links.macos ?? ''
          })
        }
        console.log('✅ Set platform info:', info)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('❌ Error fetching download URL:', message)
      }
    }

    void fetchDownloadURL()
  }, [])

  return info
}

export default usePlatformDownloadInfo

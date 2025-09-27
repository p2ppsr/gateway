/**
 * @file src/utils/getLatestMetanetclientLinks.ts
 * @description Provides a function to fetch download links for the latest BSV Desktop release from the official GitHub repository, including mobile app links and a generic download page link.
 * @version 1.1.0 (Updated 27Sep2025_1358 BST to include mobile and generic links)
 * @author xAI (Grok 3)
 * @dependencies
 * - ./logging: For logWithTimestamp
 * @changelog
 * - 27Sep2025_1358 BST (v1.1.0): Updated to support BSV Desktop branding (v0.6.5), added iOS TestFlight link, Android APK link, and generic link. Added generic property to MetanetclientLinks interface.
 * - 02Sep2025_1823 BST (v1.0.0): Updated header comment to follow standardized template.
 */
import { logWithTimestamp } from './logging'

/**
 * Represents the download URLs for the BSV Desktop and Mobile clients across supported platforms.
 *
 * @typedef {Object} MetanetclientLinks
 * @property {string | null} macos - Direct download URL for macOS (.dmg file) or `null` if unavailable.
 * @property {string | null} windows - Direct download URL for Windows (.exe file) or `null` if unavailable.
 * @property {string | null} linux - Direct download URL for Linux (.AppImage file) or `null` if unavailable.
 * @property {string | null} ios - TestFlight link for iOS beta or `null` if not available.
 * @property {string | null} android - Direct APK download link for Android or `null` if not available.
 * @property {string | null} generic - Generic download page URL or `null` if not available.
 */
const F = 'utils/getLatestMetanetclientLinks'
export interface MetanetclientLinks {
  macos: string | null
  windows: string | null
  linux: string | null
  ios: string | null
  android: string | null
  generic: string | null
}

interface GitHubRelease {
  tag_name: string
}

/**
 * Fetches the latest BSV Desktop release from GitHub and constructs
 * download links for all major platforms using the release tag, plus a generic link.
 *
 * @returns {Promise<MetanetclientLinks>} An object containing download URLs or `null` if the fetch fails.
 */
const getLatestMetanetclientLinks = async (): Promise<MetanetclientLinks> => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    const data: GitHubRelease = await response.json()
    logWithTimestamp(F, '🔍 GitHub release data:', data.toString())

    const tag: string = data.tag_name // e.g. 'bsv-desktop-v0.6.5'
    const version: string = tag.replace(/^bsv-desktop-v/, '') // e.g. '0.6.5'

    const links: MetanetclientLinks = {
      macos: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/BSV.Desktop_${version}_aarch64.dmg`,
      windows: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/BSV.Desktop_${version}_x64-setup.exe`,
      linux: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/BSV.Desktop_${version}_amd64.AppImage`,
      ios: 'https://testflight.apple.com/join/K3jmxevG',
      android: 'https://getmetanet.com/android.apk',
      generic: 'https://getmetanet.com/'
    }
    logWithTimestamp(
      F,
      '✅ Successfully fetched BSV client links:',
      JSON.stringify(links)
    )
    return links
  } catch (error: unknown) {
    console.error('❌ Failed to fetch latest BSV client release:', error)
    return {
      macos: null,
      windows: null,
      linux: null,
      ios: null,
      android: null,
      generic: null
    }
  }
}

export default getLatestMetanetclientLinks

/**
 * @file src/utils/getLatestMetanetclientLinks.ts
 *
 * Provides a function to fetch download links for the latest Metanet Desktop release
 * from the official GitHub repository, including placeholders for mobile app links.
 */

/**
 * Represents the download URLs for the Metanet client across supported platforms.
 *
 * @typedef {Object} MetanetclientLinks
 * @property {string | null} macos - Direct download URL for macOS (.dmg file) or `null` if unavailable.
 * @property {string | null} windows - Direct download URL for Windows (.exe file) or `null` if unavailable.
 * @property {string | null} linux - Direct download URL for Linux (.AppImage file) or `null` if unavailable.
 * @property {string | null} ios - App Store link for iOS or `null` if not available.
 * @property {string | null} android - Play Store link for Android or `null` if not available.
 */
export interface MetanetclientLinks {
  macos: string | null
  windows: string | null
  linux: string | null
  ios: string | null
  android: string | null
}

interface GitHubRelease {
  tag_name: string
}

/**
 * Fetches the latest Metanet Desktop release from GitHub and constructs
 * download links for all major platforms using the release tag.
 *
 * @returns {Promise<MetanetclientLinks>} An object containing download URLs or `null` if the fetch fails.
 */
const getLatestMetanetclientLinks = async (): Promise<MetanetclientLinks> => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    const data: GitHubRelease = await response.json()
    console.log('🔍 GitHub release data:', data)

    const tag: string = data.tag_name // e.g. 'metanet-desktop-v0.5.1'
    const version: string = tag.replace(/^metanet-desktop-v/, '') // e.g. '0.5.1'

    const links: MetanetclientLinks = {
      macos: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_aarch64.dmg`,
      windows: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_x64-setup.exe`,
      linux: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_amd64.AppImage`,
      ios: 'https://apps.apple.com/app/metanet/id0000000000', // TODO: update with actual link
      android: 'https://play.google.com/store/apps/details?id=com.metanet.browser' // TODO: update with actual link
    }
    console.log('✅ Successfully fetched Metanet client links:', links)
    return links
  } catch (error: unknown) {
    console.error('❌ Failed to fetch latest Metanet client release:', error)
    return {
      macos: null,
      windows: null,
      linux: null,
      ios: null,
      android: null
    }
  }
}

export default getLatestMetanetclientLinks

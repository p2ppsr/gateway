// src/utils/getLatestMetanetclientLinks.ts

export type MetanetclientLinks = {
  macos: string | null
  windows: string | null
  linux: string | null
  ios: string | null
  android: string | null
}

/**
 * Fetches the latest release tag from GitHub for metanet-desktop
 * and constructs download URLs for supported platforms.
 */
const getLatestMetanetclientLinks = async (): Promise<MetanetclientLinks> => {
  try {
    const response = await fetch(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    const data = await response.json()

    const tag = data.tag_name // e.g. 'metanet-desktop-v0.5.1'
    const version = tag.replace(/^metanet-desktop-v/, '') // e.g. '0.5.1'

    return {
      macos: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_aarch64.dmg`,
      windows: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_x64.exe`,
      linux: `https://github.com/bsv-blockchain/metanet-desktop/releases/download/${tag}/Metanet.Desktop_${version}_x64.AppImage`,
      ios: 'https://apps.apple.com/app/metanet/id0000000000', // TODO: update with actual link
      android: 'https://play.google.com/store/apps/details?id=com.metanet.browser' // TODO: update with actual link
    }
  } catch (error) {
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

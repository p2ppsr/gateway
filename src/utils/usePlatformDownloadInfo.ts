// src/utils/usePlatformDownloadInfo.ts
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import getLatestMetanetclientLinks, { MetanetclientLinks } from './getLatestMetanetclientLinks'

export type DownloadInfo = {
  platformLabel: string
  downloadURL: string
} | null

const usePlatformDownloadInfo = (): DownloadInfo => {
  const [info, setInfo] = useState<DownloadInfo>(null)

  useEffect(() => {
    const detectWebPlatform = (): keyof MetanetclientLinks => {
      const ua = navigator.userAgent || navigator.platform || 'unknown'

      if (/Mac/i.test(ua)) return 'macos'
      if (/Win/i.test(ua)) return 'windows'
      if (/Linux/i.test(ua)) return 'linux'
      return 'macos' // fallback
    }

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

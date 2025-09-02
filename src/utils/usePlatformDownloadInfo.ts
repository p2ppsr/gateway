/**
 * @file src/utils/usePlatformDownloadInfo.ts
 * @description A React hook that determines the current platform (iOS, Android, or web) and provides
 * the appropriate download URL for the Metanet client, using the latest GitHub release info.
 * @version 1.0.0 (Updated 02Sep2025_1227 BST to add header and improve JSDoc)
 * @author xAI (Grok 3)
 * @dependencies
 * - react: For useEffect and useState
 * - react-native: For Platform
 * - ./getLatestMetanetclientLinks: For fetching download links
 * - ./logging: For logWithTimestamp
 * @changelog
 * - 02Sep2025_1227 BST (v1.0.0): Added header and improved JSDoc for clarity and consistency.
 */
const F = 'utils/usePlatformDownloadInfo';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import getLatestMetanetclientLinks, { MetanetclientLinks } from './getLatestMetanetclientLinks';
import { logWithTimestamp } from './logging';

/**
 * Represents platform-specific download information for the Metanet client.
 *
 * @interface DownloadInfo
 * @property {string} platformLabel - A human-readable label for the detected platform (e.g., "iOS", "Android", "macOS").
 * @property {string} downloadURL - A direct URL to download the Metanet client for the detected platform, or empty string if unavailable.
 */
export interface DownloadInfo {
  platformLabel: string;
  downloadURL: string;
}

/**
 * A React hook that detects the current platform (iOS, Android, or web) and fetches the appropriate
 * download link for the Metanet client from the latest GitHub release.
 *
 * For mobile (iOS/Android), returns the App Store or Play Store link.
 * For web, inspects the user agent to determine macOS, Windows, or Linux platform.
 *
 * @returns {DownloadInfo | null} An object with `platformLabel` and `downloadURL`, or `null` while loading or if an error occurs.
 */
const usePlatformDownloadInfo = (): DownloadInfo | null => {
  const [info, setInfo] = useState<DownloadInfo | null>(null);

  useEffect(() => {
    /**
     * Detects the desktop platform using the browser's user agent string.
     *
     * @returns {'macos' | 'windows' | 'linux'} The inferred desktop OS key, defaults to 'macos' if unknown.
     */
    const detectWebPlatform = (): keyof MetanetclientLinks => {
      const ua = navigator.userAgent || navigator.platform || 'unknown';
      if (typeof ua === 'string' && ua !== '') {
        if (/Mac/i.test(ua)) return 'macos';
        if (/Win/i.test(ua)) return 'windows';
        if (/Linux/i.test(ua)) return 'linux';
      }
      return 'macos'; // Fallback to macOS if platform cannot be determined
    };

    /**
     * Fetches the latest Metanet client links and sets the appropriate platform info.
     *
     * @throws {Error} If fetching the links fails, logs the error and sets info to null.
     */
    const fetchDownloadURL = async (): Promise<void> => {
      try {
        const links: MetanetclientLinks = await getLatestMetanetclientLinks();
        logWithTimestamp(F, '🔍 Metanet client links:', links);
        logWithTimestamp(F, '🔍 Platform:', Platform.OS);

        if (Platform.OS === 'ios') {
          setInfo({
            platformLabel: 'iOS',
            downloadURL: links.ios ?? '',
          });
        } else if (Platform.OS === 'android') {
          setInfo({
            platformLabel: 'Android',
            downloadURL: links.android ?? '',
          });
        } else if (Platform.OS === 'web') {
          const desktopOS = detectWebPlatform();
          const labelMap: Record<string, string> = {
            macos: 'macOS',
            windows: 'Windows',
            linux: 'Linux',
          };
          setInfo({
            platformLabel: labelMap[desktopOS] || 'Desktop',
            downloadURL: links[desktopOS] ?? '',
          });
        } else {
          setInfo({
            platformLabel: 'Unknown',
            downloadURL: links.macos ?? '',
          });
        }
        logWithTimestamp(F, '✅ Set platform info:', info);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logWithTimestamp(F, '❌ Error fetching download URL:', message);
        setInfo(null);
      }
    };

    void fetchDownloadURL();
  }, []);

  return info;
};

export default usePlatformDownloadInfo;

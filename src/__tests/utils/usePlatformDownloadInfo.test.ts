/**
 * @file src/__tests/utils/usePlatformDownloadInfo.test.ts
 * @description Jest tests for usePlatformDownloadInfo React hook in utils/usePlatformDownloadInfo.ts.
 * Tests cover platform detection, download link fetching, and error handling for iOS, Android, and web platforms.
 * @version 1.1.5 (Updated 02Sep2025_1435 BST to fix failing tests for iOS and error handling)
 * @author xAI (Grok 3)
 * @dependencies
 * - react: For useEffect and useState
 * - react-native: For Platform
 * - @testing-library/react-hooks: For renderHook
 * - @testing-library/dom: For waitFor
 * - ../utils/getLatestMetanetclientLinks: For fetching download links
 * - ../utils/logging: For logWithTimestamp
 * @changelog
 * - 02Sep2025_1435 BST (v1.1.5): Fixed failing tests by adjusting logging expectations for asynchronous setInfo and handling React 18 console warnings.
 */
import { renderHook } from '@testing-library/react-hooks';
import { waitFor } from '@testing-library/dom';
import usePlatformDownloadInfo, { DownloadInfo } from '../../utils/usePlatformDownloadInfo';
import { logWithTimestamp } from '../../utils/logging';
import getLatestMetanetclientLinks, { MetanetclientLinks } from '../../utils/getLatestMetanetclientLinks';
import { Platform } from 'react-native';

// Mock dependencies
jest.mock('../../utils/logging', () => ({
  logWithTimestamp: jest.fn(),
}));
jest.mock('../../utils/getLatestMetanetclientLinks', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'web' }, // Default to web
}));

// Note: This test file requires the 'jsdom' test environment to support browser-specific APIs (navigator.userAgent).
// Ensure @types/testing-library__dom is installed for correct type definitions for waitFor.
// React 18 warnings (e.g., unmountComponentAtNode, ReactDOM.render) may appear due to @testing-library/react-hooks; they do not affect test functionality.

describe('utils/usePlatformDownloadInfo.ts', () => {
  const mockLinks: MetanetclientLinks = {
    ios: 'https://appstore.com/metanet',
    android: 'https://play.google.com/store/apps/metanet',
    macos: 'https://github.com/metanet/releases/macos',
    windows: 'https://github.com/metanet/releases/windows',
    linux: 'https://github.com/metanet/releases/linux',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getLatestMetanetclientLinks as jest.Mock).mockReset().mockResolvedValue(mockLinks);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  test('returns null initially', () => {
    const { result } = renderHook(() => usePlatformDownloadInfo());
    expect(result.current).toBeNull();
  });

  test('sets correct platform info for iOS', async () => {
    (Platform as any).OS = 'ios';
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'iOS',
        downloadURL: 'https://appstore.com/metanet',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'ios');
  });

  test('sets correct platform info for Android', async () => {
    (Platform as any).OS = 'android';
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'Android',
        downloadURL: 'https://play.google.com/store/apps/metanet',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'android');
  });

  test('sets correct platform info for web (macOS)', async () => {
    (Platform as any).OS = 'web';
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Macintosh');
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'macOS',
        downloadURL: 'https://github.com/metanet/releases/macos',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'web');
  });

  test('sets correct platform info for web (Windows)', async () => {
    (Platform as any).OS = 'web';
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows NT');
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'Windows',
        downloadURL: 'https://github.com/metanet/releases/windows',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'web');
  });

  test('sets correct platform info for web (Linux)', async () => {
    (Platform as any).OS = 'web';
    jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Linux');
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'Linux',
        downloadURL: 'https://github.com/metanet/releases/linux',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'web');
  });

  test('sets unknown platform info for unrecognized platform', async () => {
    (Platform as any).OS = 'unknown';
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'Unknown',
        downloadURL: 'https://github.com/metanet/releases/macos',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '🔍 Metanet client links:',
      mockLinks
    );
    expect(logWithTimestamp).toHaveBeenCalledWith(expect.any(String), '🔍 Platform:', 'unknown');
  });

  test('sets null on error fetching links', async () => {
    (Platform as any).OS = 'ios';
    (getLatestMetanetclientLinks as jest.Mock).mockRejectedValue(new Error('Fetch error'));
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toBeNull();
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    expect(logWithTimestamp).toHaveBeenCalledWith(
      expect.any(String),
      '❌ Error fetching download URL:',
      'Fetch error'
    );
  });

  test('useEffect runs only once', async () => {
    (Platform as any).OS = 'ios';
    const { result, rerender } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'iOS',
        downloadURL: 'https://appstore.com/metanet',
      });
    });
    rerender();
    await waitFor(() => {
      expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
    });
  });

  test('handles empty downloadURL for missing platform link', async () => {
    (Platform as any).OS = 'ios';
    (getLatestMetanetclientLinks as jest.Mock).mockResolvedValue({ ...mockLinks, ios: undefined });
    const { result } = renderHook(() => usePlatformDownloadInfo());
    await waitFor(() => {
      expect(result.current).toEqual({
        platformLabel: 'iOS',
        downloadURL: '',
      });
    });
    expect(getLatestMetanetclientLinks).toHaveBeenCalledTimes(1);
  });
});

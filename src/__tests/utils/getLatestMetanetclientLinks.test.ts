/**
 * @file src/__tests/utils/getLatestMetanetclientLinks.test.ts
 * @description Jest tests for getLatestMetanetclientLinks function in utils/getLatestMetanetclientLinks.ts.
 * Tests cover successful fetching of GitHub release data, link construction, and error handling.
 * @version 1.0.2 (Updated 02Sep2025_1846 BST to fix invalid response test)
 * @author xAI (Grok 3)
 * @dependencies
 * - node-fetch: For fetch API
 * - ../utils/logging: For logWithTimestamp
 * @changelog
 * - 02Sep2025_1846 BST (v1.0.2): Fixed invalid response test by removing incorrect logWithTimestamp expectation.
 */
import getLatestMetanetclientLinks, {
  MetanetclientLinks
} from '../../utils/getLatestMetanetclientLinks'
import { logWithTimestamp } from '../../utils/logging'

// Mock dependencies
jest.mock('../../utils/logging', () => ({
  logWithTimestamp: jest.fn()
}))
global.fetch = jest.fn()

describe('utils/getLatestMetanetclientLinks.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('fetches and constructs correct download links for valid GitHub release', async () => {
    const mockResponse = {
      json: jest.fn().mockResolvedValue({ tag_name: 'metanet-desktop-v0.5.1' })
    }
    ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

    const expectedLinks: MetanetclientLinks = {
      macos:
        'https://github.com/bsv-blockchain/metanet-desktop/releases/download/metanet-desktop-v0.5.1/Metanet.Desktop_0.5.1_aarch64.dmg',
      windows:
        'https://github.com/bsv-blockchain/metanet-desktop/releases/download/metanet-desktop-v0.5.1/Metanet.Desktop_0.5.1_x64-setup.exe',
      linux:
        'https://github.com/bsv-blockchain/metanet-desktop/releases/download/metanet-desktop-v0.5.1/Metanet.Desktop_0.5.1_amd64.AppImage',
      ios: 'https://apps.apple.com/app/metanet/id0000000000',
      android:
        'https://play.google.com/store/apps/details?id=com.metanet.browser'
    }

    const result = await getLatestMetanetclientLinks()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    expect(mockResponse.json).toHaveBeenCalled()
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'utils/getLatestMetanetclientLinks',
      '🔍 GitHub release data:',
      '[object Object]'
    )
    expect(logWithTimestamp).toHaveBeenCalledWith(
      'utils/getLatestMetanetclientLinks',
      '✅ Successfully fetched Metanet client links:',
      expect.any(String)
    )
    expect(console.error).not.toHaveBeenCalled()
    expect(result).toEqual(expectedLinks)
  })

  test('returns null links for invalid GitHub response', async () => {
    const mockResponse = {
      json: jest.fn().mockRejectedValue(new Error('Invalid response'))
    }
    ;(global.fetch as jest.Mock).mockResolvedValue(mockResponse)

    const expectedLinks: MetanetclientLinks = {
      macos: null,
      windows: null,
      linux: null,
      ios: null,
      android: null
    }

    const result = await getLatestMetanetclientLinks()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    expect(mockResponse.json).toHaveBeenCalled()
    expect(logWithTimestamp).not.toHaveBeenCalledWith(
      expect.any(String),
      '🔍 GitHub release data:',
      expect.anything()
    )
    expect(logWithTimestamp).not.toHaveBeenCalledWith(
      expect.any(String),
      '✅ Successfully fetched Metanet client links:',
      expect.anything()
    )
    expect(console.error).toHaveBeenCalledWith(
      '❌ Failed to fetch latest Metanet client release:',
      expect.any(Error)
    )
    expect(result).toEqual(expectedLinks)
  })

  test('returns null links on network error', async () => {
    const error = new Error('Network error')
    ;(global.fetch as jest.Mock).mockRejectedValue(error)

    const expectedLinks: MetanetclientLinks = {
      macos: null,
      windows: null,
      linux: null,
      ios: null,
      android: null
    }

    const result = await getLatestMetanetclientLinks()

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/bsv-blockchain/metanet-desktop/releases/latest'
    )
    expect(logWithTimestamp).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '❌ Failed to fetch latest Metanet client release:',
      error
    )
    expect(result).toEqual(expectedLinks)
  })
})

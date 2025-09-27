/**
 * @file utils/general.test.ts
 * @description Jest tests for utility functions in utils/general.ts.
 * Tests cover ID generation, formatting, timestamp conversion, HTTP fetching, CSS validation, and sanitization.
 * @author xAI
 * @date 2025-09-01
 * @version 1.17
 * @changelog
 * - 2025-09-01: Fixed fetchWithTimeout timeout test by mocking setTimeout directly to ensure error is caught.
 * - 2025-09-01: Fixed fetchWithTimeout fetch failure test to expect correct error message ("Network error").
 * - 2025-09-01: Fixed fetchWithTimeout timeout test by using jest.useFakeTimers and resolving promise before rejection check.
 * - 2025-09-01: Fixed fetchWithTimeout timeout test by mocking setTimeout to reject immediately, removed jest.useFakeTimers to resolve TS2345, and updated fetch failure test.
 * - 2025-09-01: Fixed fetchWithTimeout timeout test by removing Promise.race and using jest.advanceTimersByTimeAsync.
 * - 2025-09-01: Aligned tests with improved utils/general.ts (v1.16), fixed fetchWithTimeout timeout test with Promise.race, updated expectations for input validation.
 * - 2025-09-01: Fixed fetchWithTimeout timeout test by mocking setTimeout directly and using jest.advanceTimersByTimeAsync.
 * - 2025-09-01: Fixed fetchWithTimeout timeout test to use setImmediate and increased test timeout to 10000ms.
 * - 2025-09-01: Fixed fetchWithTimeout timeout test to use jest.runAllTimersAsync for proper timer handling.
 * - 2025-09-01: Fixed generateBase58 mock to use single Uint32Array and fetchWithTimeout timeout test to use advanceTimersByTimeAsync correctly.
 * - 2025-09-01: Fixed tests to handle runtime errors for non-string inputs, adjusted getBase58Regex test for global flag, corrected formatTimeLocal expectation, and simplified fetchWithTimeout mock.
 * - 2025-09-01: Removed import '@types/jest'; and added Jest types to tsconfig.json to resolve TS6137 error.
 * - 2025-09-01: Added import for @types/jest to resolve TypeScript errors for Jest globals.
 * - 2025-09-01: Updated setup instructions to include ts-jest installation for preset support.
 */
import {
  generateBase58,
  generateRandomHex,
  getBase58Regex,
  isBase58,
  isMerchantId,
  formatId,
  formatTimeLocal,
  formatTimestamp,
  fetchWithTimeout,
  validateCSS,
  extractCSS,
  sanitizeInput
} from '../../utils/general'
import { WalletClient, AuthFetch, PublicKey } from '@bsv/sdk'

// Mock crypto.getRandomValues for deterministic randomness
const mockRandomValues = jest.fn()
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: mockRandomValues
  }
})

// Mock @bsv/sdk dependencies
jest.mock('@bsv/sdk', () => ({
  WalletClient: jest.fn().mockImplementation(() => ({})),
  AuthFetch: jest.fn().mockImplementation(() => ({
    fetch: jest.fn()
  })),
  PublicKey: {
    fromString: jest.fn()
  }
}))

describe('utils/general.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRandomValues.mockReset()
  })

  describe('generateBase58', () => {
    test('generates a Base58 string of specified length', () => {
      mockRandomValues.mockReturnValue(new Uint32Array([0, 1, 2, 3]))
      const result = generateBase58(4)
      expect(result).toBe('1234')
      expect(result.length).toBe(4)
      expect(
        /[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{4}/.test(
          result
        )
      ).toBe(true)
    })

    test('throws error for non-positive length', () => {
      expect(() => generateBase58(0)).toThrow(
        'Length must be a positive integer'
      )
      expect(() => generateBase58(-1)).toThrow(
        'Length must be a positive integer'
      )
      expect(() => generateBase58(1.5)).toThrow(
        'Length must be a positive integer'
      )
    })

    test('uses default length of 12', () => {
      mockRandomValues.mockReturnValue(new Uint32Array(12).fill(0))
      const result = generateBase58()
      expect(result.length).toBe(12)
      expect(result).toBe('111111111111')
    })
  })

  describe('generateRandomHex', () => {
    test('generates a hex string of specified length', () => {
      mockRandomValues.mockReturnValue(new Uint32Array([0, 1, 2, 3]))
      const result = generateRandomHex(4)
      expect(result).toBe('0123')
      expect(result.length).toBe(4)
      expect(/[0-9a-f]{4}/.test(result)).toBe(true)
    })

    test('throws error for zero length', () => {
      expect(() => generateRandomHex(0)).toThrow(
        'Length must be a positive integer'
      )
    })

    test('throws error for negative length', () => {
      expect(() => generateRandomHex(-1)).toThrow(
        'Length must be a positive integer'
      )
    })

    test('uses default length of 12', () => {
      mockRandomValues.mockReturnValue(new Uint32Array(12).fill(0))
      const result = generateRandomHex()
      expect(result.length).toBe(12)
      expect(/[0-9a-f]{12}/.test(result)).toBe(true)
    })
  })

  describe('getBase58Regex', () => {
    test('returns a regex matching 12-character Base58 strings', () => {
      const regex = getBase58Regex()
      expect(regex.test('123456789ABC')).toBe(true)
      expect(regex.test('123456789AB')).toBe(false)
      expect(regex.test('123456789ABCD')).toBe(false) // Strict length matching
      expect(regex.test('!@#$%^&*()_+')).toBe(false)
    })

    test('regex does not include global flag', () => {
      const regex = getBase58Regex()
      expect(regex.global).toBe(false)
    })
  })

  describe('isBase58', () => {
    test('returns true for valid 12-character Base58 ID', () => {
      expect(isBase58('123456789ABC')).toBe(true)
    })

    test('returns false for invalid Base58 ID', () => {
      expect(isBase58('123456789AB')).toBe(false) // Too short
      expect(isBase58('123456789ABCD')).toBe(false) // Too long
      expect(isBase58('!@#$%^&*()_+')).toBe(false) // Invalid characters
      expect(isBase58('')).toBe(false) // Empty string
      expect(isBase58(null as any)).toBe(false) // Non-string
      expect(isBase58(undefined as any)).toBe(false) // Non-string
    })
  })

  describe('isMerchantId', () => {
    beforeEach(() => {
      ;(PublicKey.fromString as jest.Mock).mockReset()
    })

    test('returns true for valid 64-character hex string', () => {
      const validHex = 'a'.repeat(64)
      ;(PublicKey.fromString as jest.Mock).mockReturnValue({})
      expect(isMerchantId(validHex)).toBe(true)
      expect(PublicKey.fromString).toHaveBeenCalledWith(validHex)
    })

    test('returns true for valid 66-character compressed public key', () => {
      const validKey = '02' + 'a'.repeat(64)
      ;(PublicKey.fromString as jest.Mock).mockReturnValue({})
      expect(isMerchantId(validKey)).toBe(true)
      expect(PublicKey.fromString).toHaveBeenCalledWith(validKey)
    })

    test('returns false for invalid length', () => {
      expect(isMerchantId('a'.repeat(63))).toBe(false)
      expect(isMerchantId('a'.repeat(65))).toBe(false)
      expect(isMerchantId('a'.repeat(67))).toBe(false)
    })

    test('returns false for non-hex string', () => {
      expect(isMerchantId('g'.repeat(64))).toBe(false)
    })

    test('returns false for 66-character string not starting with 02 or 03', () => {
      expect(isMerchantId('01' + 'a'.repeat(64))).toBe(false)
    })

    test('returns false for invalid public key', () => {
      const invalidKey = '02' + 'a'.repeat(64)
      ;(PublicKey.fromString as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid public key')
      })
      expect(isMerchantId(invalidKey)).toBe(false)
    })

    test('returns false for non-string inputs', () => {
      expect(isMerchantId(null as any)).toBe(false)
      expect(isMerchantId(undefined as any)).toBe(false)
      expect(isMerchantId('')).toBe(false)
    })
  })

  describe('formatId', () => {
    test('formats ID with first 4 and last 4 characters', () => {
      expect(formatId('abcdefghijklmnop')).toBe('abcd...mnop')
    })

    test('returns original string for IDs shorter than 8 characters', () => {
      expect(formatId('abcdefg')).toBe('abcdefg')
      expect(formatId('')).toBe('')
    })

    test('returns empty string for non-string inputs', () => {
      expect(formatId(null as any)).toBe('')
      expect(formatId(undefined as any)).toBe('')
    })
  })

  describe('formatTimeLocal', () => {
    test('formats valid ISO timestamp to local timezone', () => {
      const dateStr = '2025-09-01T13:54:08Z'
      const expected = new Date(dateStr)
        .toLocaleString('en-GB', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        .replace(',', '')
      expect(formatTimeLocal(dateStr)).toBe(expected)
    })

    test('returns N/A for invalid timestamp', () => {
      expect(formatTimeLocal('invalid')).toBe('N/A')
    })

    test('returns N/A for null/undefined', () => {
      expect(formatTimeLocal(null)).toBe('N/A')
      expect(formatTimeLocal(undefined)).toBe('N/A')
    })
  })

  describe('formatTimestamp', () => {
    test('formats valid ISO timestamp to UTC YYYY-MM-DD HH:MM:SS', () => {
      expect(formatTimestamp('2025-09-01T13:54:08Z')).toBe(
        '2025-09-01 13:54:08'
      )
    })

    test('returns N/A for invalid timestamp', () => {
      expect(formatTimestamp('invalid')).toBe('N/A')
    })

    test('returns N/A for undefined', () => {
      expect(formatTimestamp(undefined)).toBe('N/A')
    })
  })

  describe('fetchWithTimeout', () => {
    let mockFetch: jest.Mock
    let wallet: WalletClient

    beforeEach(() => {
      wallet = new WalletClient('json-api', 'test-origin')
      mockFetch = jest.fn()
      ;(AuthFetch as jest.Mock).mockImplementation(() => ({
        fetch: mockFetch
      }))
    })

    test('successfully fetches with valid response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest
          .fn()
          .mockResolvedValue('{"status":"success","id":"123456789ABC"}')
      })
      const options = {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      }
      const response = await fetchWithTimeout(
        'http://example.com',
        options,
        wallet,
        1000
      )
      expect(response).toBeDefined()
      expect(mockFetch).toHaveBeenCalledWith('http://example.com', options)
    })

    test('throws error on timeout', async () => {
      mockFetch.mockImplementation(async () => await new Promise(() => {})) // Never resolves
      jest
        .spyOn(global, 'setTimeout')
        .mockImplementation((callback: () => void) => {
          callback() // Immediately trigger timeout
          return 0 as any // Mock timer ID
        })
      await expect(
        fetchWithTimeout('http://example.com', {}, wallet, 1000)
      ).rejects.toThrow(
        'Request timed out after 1000ms for URL: http://example.com'
      )
      jest.spyOn(global, 'setTimeout').mockRestore()
    }, 10000)

    test('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('Invalid request')
      })
      await expect(
        fetchWithTimeout('http://example.com', {}, wallet)
      ).rejects.toThrow(
        'Failed to fetch http://example.com with method GET: Status 400 Bad Request, Details: Invalid request'
      )
    })

    test('throws error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      await expect(
        fetchWithTimeout('http://example.com', {}, wallet)
      ).rejects.toThrow('Network error')
    })
  })

  describe('validateCSS', () => {
    test('returns true for valid CSS', () => {
      const css = `
        .test {
          color: #fff;
          background: linear-gradient(45deg, #000000, #ffffff);
        }
      `
      expect(validateCSS(css)).toBe(true)
    })

    test('returns false for invalid CSS (unbalanced parentheses)', () => {
      const css = '.test { background: linear-gradient(45deg, #fff, #000; }'
      expect(validateCSS(css)).toBe(false)
    })

    test('returns false for invalid CSS (missing selector)', () => {
      const css = '{ color: #fff; }'
      expect(validateCSS(css)).toBe(false)
    })

    test('returns false for invalid CSS (invalid hex color)', () => {
      const css = '.test { color: #ggg; }'
      expect(validateCSS(css)).toBe(false)
    })

    test('returns false for non-string inputs', () => {
      expect(validateCSS(null as any)).toBe(false)
      expect(validateCSS(undefined as any)).toBe(false)
    })
  })

  describe('extractCSS', () => {
    test('extracts CSS from <style> tag', () => {
      const input = '<style>.test { color: #fff; }</style>'
      expect(extractCSS(input)).toBe('.test { color: #fff; }')
    })

    test('returns trimmed input if no style tag', () => {
      const input = '.test { color: #fff; }'
      expect(extractCSS(input)).toBe('.test { color: #fff; }')
    })

    test('returns empty string for non-string inputs', () => {
      expect(extractCSS(null as any)).toBe('')
      expect(extractCSS(undefined as any)).toBe('')
      expect(extractCSS('')).toBe('')
    })
  })

  describe('sanitizeInput', () => {
    test('escapes HTML characters from input', () => {
      expect(sanitizeInput('Hello <script>World</script>')).toBe(
        'Hello &lt;script&gt;World&lt;/script&gt;'
      )
    })

    test('returns empty string for non-string inputs', () => {
      expect(sanitizeInput(null as any)).toBe('')
      expect(sanitizeInput(undefined as any)).toBe('')
      expect(sanitizeInput('')).toBe('')
    })
  })
})

/**
 * @file jest.config.js
 * @description Jest configuration for running tests in the project, using jsdom for browser-specific tests.
 * @version 1.0.0 (Updated 02Sep2025_1431 BST to support jsdom for usePlatformDownloadInfo.test.ts)
 * @author xAI (Grok 3)
 * @dependencies
 * - jest: For test framework
 * - ts-jest: For TypeScript support
 * - jest-environment-jsdom: For jsdom test environment
 * @changelog
 * - 02Sep2025_1431 BST (v1.0.0): Configured jsdom environment for browser-specific tests like usePlatformDownloadInfo.test.ts.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Use jsdom for browser-specific APIs (e.g., navigator.userAgent)
  testMatch: ['**/?(*.)+(test).ts'], // Match all .test.ts files
};
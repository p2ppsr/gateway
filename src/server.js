/**
 * @file server.js
 * @description
 * Entry point for running the Gateway backend in development mode using `ts-node`.
 * This file:
 * - Registers `ts-node` to enable direct execution of TypeScript files.
 * - Requires and runs `server.ts`, which contains the actual server logic.
 *
 * Usage:
 *   node src/server.js
 *
 * Notes:
 * - Typically used with `nodemon` or other dev tools that monitor `.js` files.
 * - This setup avoids the need to precompile TypeScript during development.
 * @version 1.0.0
 * @author xAI (Grok 3)
 */

require("ts-node/register");
require("./server.ts");

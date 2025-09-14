// src/express.d.ts
import { AuthRequest } from '@bsv/auth-express-middleware'

declare global {
  namespace Express {
    interface Request {
      /**
       * Authentication context injected by @bsv/auth-express-middleware.
       */
      auth?: (AuthRequest['auth'] & {
      })
    }
  }
}

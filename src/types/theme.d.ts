/**
 * @file src/types/theme.d.ts
 *
 * Module augmentation for MUI's Theme and ThemeOptions types.
 * This extends the default MUI theme to support custom layout fields
 * such as `maxContentWidth` and reusable `templates` for styling page elements.
 *
 * These theme additions can be used throughout your application with
 * `useTheme()` or `styled()` components.
 */

import { Theme as MUITheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  /**
   * Extends the MUI Theme interface to include additional layout and template fields.
   *
   * @property {string} [maxContentWidth] - Optional maximum content width (e.g., '1200px').
   * @property {object} [templates] - Optional collection of reusable layout style snippets.
   * @property {any} [templates.page_wrap] - Template for wrapping full pages or views.
   * @property {any} [templates.subheading] - Template for a subheading style.
   * @property {any} [templates.subheading_f] - Template for a bold/fixed subheading style.
   * @property {any} [templates.centeredHeader] - Template for a centered header section.
   */
  interface Theme extends MUITheme {
    maxContentWidth?: string
    templates?: {
      page_wrap?: any
      subheading?: any
      subheading_f?: any
      centeredHeader?: any
    }
  }

  /**
   * Extends the MUI ThemeOptions interface to allow specifying custom theme values during creation.
   *
   * @property {string} [maxContentWidth] - Optional default content width to apply in the theme.
   * @property {object} [templates] - Optional default style templates to include.
   */
  interface ThemeOptions {
    maxContentWidth?: string
    templates?: {
      page_wrap?: any
      subheading?: any
      subheading_f?: any
      centeredHeader?: any
    }
  }
}

// frontend/src/types/theme.d.ts
import { Theme as MUITheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Theme extends MUITheme {
    maxContentWidth?: string
    templates?: {
      page_wrap?: any
      subheading?: any
      subheading_f?: any
      centeredHeader?: any
    }
  }

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

import React from 'react'
import { Typography } from '@mui/material'

export type SortDirection = 'asc' | 'desc'

interface SortableHeaderProps {
  label: string
  active: boolean
  direction: SortDirection
  onClick: () => void
  sx?: any
}

const SortableHeader: React.FC<SortableHeaderProps> = ({ label, active, direction, onClick, sx }) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }

  return (
    <Typography
      role="button"
      tabIndex={0}
      aria-label={`sort by ${label}${active ? `, current ${direction}ending` : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      sx={{
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        color: 'inherit',
        ...sx
      }}
    >
      {label}
      {active ? (direction === 'asc' ? '↑' : '↓') : null}
    </Typography>
  )
}

export default SortableHeader

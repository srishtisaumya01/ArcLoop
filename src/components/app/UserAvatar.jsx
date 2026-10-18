import { useState } from 'react'
import { Box } from '@mui/material'
import { avatarUrl } from '../../services/accountService.js'
import { initialsOf } from '../../utils/greeting.js'
import { colors } from '../../theme/tokens.js'

// The person's picture, or their initials on the brand gradient when they have not added one (or it fails to load).
export default function UserAvatar({ name, version, size = 40, sx }) {
  const src = avatarUrl(version)
  const [failed, setFailed] = useState(null) // the src that failed, so a new picture gets a fresh try
  const showImage = src && failed !== src
  return (
    <Box
      aria-hidden="true"
      sx={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${colors.mint300}, ${colors.ice400})`, color: colors.navy900, fontWeight: 800, fontSize: size * 0.4, ...sx }}
    >
      {showImage ? <Box component="img" src={src} alt="" onError={() => setFailed(src)} sx={{ width: 1, height: 1, objectFit: 'cover', display: 'block' }} /> : initialsOf(name || '')}
    </Box>
  )
}

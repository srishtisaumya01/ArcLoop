import { createContext } from 'react'
import { navOuterHeight } from '../theme/tokens.js'

// How much room the floating navbar takes at the top of the page. Header bands run their gradient up behind it by this much;
// inside the signed-in shell there is no navbar, so the shell provides 0.
export const NavOffsetContext = createContext(navOuterHeight)

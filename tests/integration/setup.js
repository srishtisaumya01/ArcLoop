import { configure } from '@testing-library/react'

// Every operation is a real HTTP round trip to a real server (not an in-process database), so screens take longer
// to settle than in a unit test. Waiting is cheap; a wrong guess here only delays a failure.
configure({ asyncUtilTimeout: 15000 })

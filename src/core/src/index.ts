import {
  CallSiteLike,
  CallSiteLikeJSON,
} from '@tapjs/stack'

export * from './base.js'
export * from './parse-test-args.js'
export * from './spawn.js'
export * from './stdin.js'
export * from './tap-dir.js'
export * from './test-base.js'
export * from './test.js'
export * from './main-script.js'
export * from './proc.js'

/**
 * The extra info passed to assertions.
 * Extended by BaseOpts, TestBaseOpts, and ultimately TestOpts, since
 * any subtest is also an assertion, and can take all the same assertion
 * options.
 */
export interface Extra {
  bail?: boolean
  todo?: string | boolean
  skip?: string | boolean
  at?: CallSiteLike | CallSiteLikeJSON
  stack?: string
  source?: string
  found?: any
  wanted?: any
  doNotWant?: any
  pattern?: any
  diff?: string
  message?: string
  expired?: string
  // error properties
  type?: string
  error?: any
  expectFail?: boolean
  diagnostic?: boolean
  tapChildBuffer?: string
  test?: string
}

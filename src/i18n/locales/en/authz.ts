import type ru from '../ru/authz'
import type { Translation } from '../types'

/** English catalog mirroring locales/ru/authz.ts. */
export default {
  preset: {
    admin: 'Administrator',
    dp: 'Project director',
    rp: 'Project manager',
    vp: 'Process owner',
    worker: 'Employee',
  },
  scope: {
    notSet: 'not set',
    all: 'all',
    forbidden: 'forbidden',
    self: 'own',
    parents: 'parents',
    ancestors: 'ancestors',
    ancestors2: 'ancestors up to level 2',
    subtree: 'subtree',
    subtree2: 'subtree level 2',
    siblings: 'siblings',
    unknown: '“{token}”',
    join: ' + ',
  },
} satisfies Translation<typeof ru>

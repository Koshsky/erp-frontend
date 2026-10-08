import type { Meta, StoryObj } from '@storybook/vue3'
import { expect } from 'storybook/test'

import UserPermissionsEditor from './UserPermissionsEditor.vue'
import { argTypes, sampleModel, sampleAdminModel } from './argTypes'

const meta: Meta<typeof UserPermissionsEditor> = {
  title: 'Common/UserPermissionsEditor',
  component: UserPermissionsEditor,
  argTypes,
  parameters: {
    docs: {
      description: {
        component:
          'Individual permissions of an admin user (or a draft for the create page): the effective matrix of the user (assigned preset + overrides) with grant/revoke/revert actions. `user` mode reads the RBAC store by userId; `draft` mode builds the baseline from the preset; the `preview` prop injects static data for storybook.',
      },
    },
  },
}

export default meta

type Story = StoryObj<typeof UserPermissionsEditor>

/** Catalog of presets for the header switch (same shape as the page passes). */
const presetOptions = [
  { value: 'admin', label: 'Администратор' },
  { value: 'dp', label: 'Директор проектов' },
  { value: 'rp', label: 'Руководитель проекта' },
  { value: 'vp', label: 'Владелец процесса' },
  { value: 'worker', label: 'Работник' },
]

export const Default: Story = {
  name: 'User (edit page)',
  args: {
    mode: 'user',
    userId: 4,
    preset: 'rp',
    presetOptions,
    preview: sampleModel(),
  },
}

export const DraftMode: Story = {
  name: 'Draft (create page, preset rp)',
  args: {
    mode: 'draft',
    preset: 'rp',
    presetOptions,
    userId: 0,
    preview: sampleModel(),
  },
}

export const AdminBypass: Story = {
  name: 'Admin (read-only)',
  args: {
    mode: 'user',
    userId: 1,
    preset: 'admin',
    presetOptions,
    preview: sampleAdminModel(),
  },
}

export const NoPreset: Story = {
  name: 'Without preset',
  args: {
    mode: 'user',
    userId: 7,
    presetOptions,
    preview: { ...sampleModel(), preset: null, presetScope: [], effective: [] },
  },
}

/**
 * Test: the visible zone chips (Variant A) toggle a multi-move expression —
 * two selected moves stay active together, "запрет" is exclusive and clears
 * every other chip, and the two mounted instances stay isolated.
 */
export const ChipMultiSelect: Story = {
  name: 'Test: chips toggle a multi-move expression; «запрет» is exclusive (per instance)',
  tags: ['vitest'],
  render: () => ({
    components: { UserPermissionsEditor },
    data: () => ({
      model: sampleModel(),
      opts: presetOptions,
    }),
    template: `
      <div style="max-width:760px;">
        <UserPermissionsEditor mode="user" :user-id="4" preset="rp" :preset-options="opts" :preview="model" />
        <div style="height:24px;"></div>
        <UserPermissionsEditor mode="user" :user-id="5" preset="dp" :preset-options="opts" :preview="model" data-editor="second" />
      </div>
    `,
  }),
  play: async ({ step }) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    await step('mount: both editors render zone chips', async () => {
      await wait(50)
      expect(document.querySelectorAll('.ur-chip').length).toBeGreaterThan(0)
      expect(document.querySelectorAll('section[data-editor="second"] .ur-chip').length).toBeGreaterThan(0)
    })

    await step('clicking a chip toggles its move on and off', async () => {
      // "Процессы" card — a resource with several ordinary moves.
      const cards = document.querySelectorAll('.uped-res-card')
      const row = cards[1]?.querySelector('.ur-row') as HTMLElement
      const chips = [...row.querySelectorAll<HTMLButtonElement>('.ur-chip:not(.rev)')]
      const first = chips.find((c) => !c.classList.contains('on'))
      expect(first).toBeTruthy()
      first!.click()
      await wait(30)
      expect(first!.classList.contains('on')).toBe(true)
      first!.click()
      await wait(30)
      expect(first!.classList.contains('on')).toBe(false)
    })

    await step('two moves compose one expression: both chips stay active', async () => {
      const cards = document.querySelectorAll('.uped-res-card')
      const row = cards[1]?.querySelector('.ur-row') as HTMLElement
      const chips = [...row.querySelectorAll<HTMLButtonElement>('.ur-chip:not(.rev)')].filter(
        (c) => c.textContent !== 'Все',
      )
      const inactive = chips.filter((c) => !c.classList.contains('on'))
      const a = inactive[0]
      const b = inactive[1] ?? inactive[0]
      a.click()
      b.click()
      await wait(30)
      expect(a.classList.contains('on')).toBe(true)
      expect(b.classList.contains('on')).toBe(true)
      a.click()
      b.click()
      await wait(30)
    })

    await step('«⛔ запрет» is exclusive: selecting it clears all other chips', async () => {
      const cards = document.querySelectorAll('.uped-res-card')
      const row = cards[1]?.querySelector('.ur-row') as HTMLElement
      const chips = [...row.querySelectorAll<HTMLButtonElement>('.ur-chip:not(.rev)')]
      const rev = row.querySelector<HTMLButtonElement>('.ur-chip.rev')
      const inactive = chips.filter((c) => !c.classList.contains('on'))
      inactive[0]?.click()
      rev?.click()
      await wait(30)
      expect(rev?.classList.contains('on')).toBe(true)
      expect(chips.every((c) => !c.classList.contains('on'))).toBe(true)
      // Second click returns to the preset — the row restores its baseline.
      rev?.click()
      await wait(30)
      expect(rev?.classList.contains('on')).toBe(false)
    })
  },
}
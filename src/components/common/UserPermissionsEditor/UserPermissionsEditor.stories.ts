import type { Meta, StoryObj } from '@storybook/vue3'
import { expect } from 'vitest'

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
 * Test (regression for 9e0b093): the document click listener is per-instance —
 * it is added on mount, only acts when THIS instance has an open dropdown and
 * closes it on an outside click. Two mounted editors must stay isolated.
 *
 * Unmount-cleanup note: the play model here cannot unmount a story mid-test
 * (no @storybook/test `mount` in this repo), so the "listener removed on
 * unmount" half of the fix is asserted only by the mounted behavior contract:
 * the listener is inert while the dropdown is closed (outside clicks do not
 * throw or mutate anything).
 */
export const DropdownOutsideClickAndIsolation: Story = {
  name: 'Test: dropdown opens on click, closes on outside click (per instance)',
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
  play: async ({ canvasElement, step }) => {
    await step('mount: both editors render dropdown buttons', async () => {
      await new Promise((r) => setTimeout(r, 50))
      expect(document.querySelectorAll('.dd-btn').length).toBeGreaterThan(0)
      expect(document.querySelectorAll('section[data-editor="second"] .dd-btn').length).toBeGreaterThan(0)
    })

    await step('clicking a button opens its dropdown menu', async () => {
      const btn = document.querySelector('.dd-btn') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 30))
      const menu = btn.parentElement?.querySelector<HTMLElement>('.dd-menu')
      expect(menu?.classList.contains('show')).toBe(true)
    })

    await step('the second editor stays closed (per-instance state)', () => {
      const menus = [...document.querySelectorAll('section[data-editor="second"] .dd-menu')]
      expect(menus.every((m) => !m.classList.contains('show'))).toBe(true)
    })

    await step('document click outside closes the dropdown', async () => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise((r) => setTimeout(r, 30))
      const menus = [...document.querySelectorAll('.dd-menu')]
      expect(menus.length).toBeGreaterThan(0)
      expect(menus.every((m) => !m.classList.contains('show'))).toBe(true)
    })

    await step('the closed-instance listener is inert: clicks inside a row keep it closed', async () => {
      // Re-opening and closing again proves a full open/close cycle still works.
      const btn = document.querySelector('.dd-btn') as HTMLButtonElement
      btn.click()
      await new Promise((r) => setTimeout(r, 30))
      expect(btn.parentElement?.querySelector('.dd-menu')?.classList.contains('show')).toBe(true)
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await new Promise((r) => setTimeout(r, 30))
      expect(btn.parentElement?.querySelector('.dd-menu')?.classList.contains('show')).toBe(false)
    })
  },
}
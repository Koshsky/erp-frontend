import type { Meta, StoryObj } from '@storybook/vue3'

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
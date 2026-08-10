import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { defineComponent, h, onMounted } from 'vue'
import PrintDialog from './PrintDialog.vue'
import { useDiagramPrint } from '../../../composables/useDiagramPrint'

/** Обёртка: открывает диалог через общий композабл печати. */
const DialogOpener = defineComponent({
  setup() {
    const print = useDiagramPrint()
    onMounted(() => {
      print.state.unit = 'day'
      print.state.scale = 100
      print.state.orientation = 'landscape'
      print.state.open = true
    })
    return () => h(PrintDialog)
  },
})

const meta: Meta<typeof DialogOpener> = {
  title: 'Components/Common/PrintDialog',
  component: DialogOpener,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof DialogOpener>

export const Default: Story = {}

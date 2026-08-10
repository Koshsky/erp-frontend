<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDiagramPrint } from '../../../composables/useDiagramPrint'
import { UNIT_OPTIONS } from '../../../composables/usePlanningOrigin'

const { state, run, close, applyUnit, buildPages, getContent } = useDiagramPrint()

const title = computed(() => (state.mode === 'save' ? 'Сохранить в PDF' : 'Печать диаграммы'))
const actionLabel = computed(() => (state.mode === 'save' ? 'Сохранить PDF' : 'Печать'))

/** Габариты области preview (миниатюры страниц вписываются в неё). */
const PREVIEW_W = 340
const PREVIEW_H = 460

const previewEl = ref<HTMLElement | null>(null)

/** Рисует постраничные миниатюры печати (вписано в один лист или разбито). */
function refreshPreview() {
  const el = previewEl.value
  if (!el) return
  el.innerHTML = ''
  const layout = buildPages()
  const content = getContent()
  if (!layout || !content || layout.contentWidth <= 0) {
    const empty = document.createElement('p')
    empty.className = 'pd-empty'
    empty.textContent = 'Диаграмма ещё не загружена'
    el.appendChild(empty)
    return
  }
  const pageH = layout.contentHeight * layout.scale
  const scale = Math.min(PREVIEW_W / layout.pageW, PREVIEW_H / Math.max(pageH, 1))
  for (let i = 0; i < layout.slices; i++) {
    const page = document.createElement('div')
    page.className = 'pd-page'
    page.style.width = `${layout.pageW * scale}px`
    page.style.height = `${pageH * scale}px`
    const clone = content.cloneNode(true) as HTMLElement
    clone.style.transform = `scale(${layout.scale * scale})`
    clone.style.transformOrigin = 'top left'
    clone.style.position = 'absolute'
    clone.style.left = `${-i * layout.pageW * scale}px`
    clone.style.top = '0'
    clone.style.width = `${layout.contentWidth}px`
    clone.style.height = `${layout.contentHeight}px`
    clone.style.overflow = 'hidden'
    page.appendChild(clone)
    if (layout.slices > 1) {
      const num = document.createElement('span')
      num.className = 'pd-page-num'
      num.textContent = String(i + 1)
      page.appendChild(num)
    }
    el.appendChild(page)
  }
}

let previewTimer: number | null = null
function schedulePreview() {
  if (previewTimer != null) clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => {
    previewTimer = null
    refreshPreview()
  }, 150)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

watch([() => state.unit, () => state.scale, () => state.orientation], schedulePreview)
watch(
  () => state.open,
  (o) => {
    if (o) void nextTick().then(refreshPreview)
  },
)

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  if (state.open) refreshPreview()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (previewTimer != null) clearTimeout(previewTimer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="state.open" class="pd-overlay" @mousedown.self="close">
      <div class="pd" role="dialog" aria-modal="true" :aria-label="title">
        <div class="pd-head">
          <h3 class="pd-title">{{ title }}</h3>
          <button type="button" class="pd-close" aria-label="Закрыть" @click="close">×</button>
        </div>

        <div ref="previewEl" class="pd-preview"></div>

        <div class="pd-row">
          <span class="pd-label">Масштаб шкалы</span>
          <div class="pd-seg">
            <button
              v-for="o in UNIT_OPTIONS"
              :key="o.value"
              type="button"
              :class="['pd-seg-btn', { active: state.unit === o.value }]"
              @click="applyUnit(o.value)"
            >
              {{ o.label }}
            </button>
          </div>
        </div>

        <div class="pd-row">
          <span class="pd-label">Масштаб печати: {{ state.scale }}%</span>
          <input v-model.number="state.scale" type="range" min="25" max="200" step="5" class="pd-range" />
          <p class="pd-hint">100% — вся диаграмма на одном листе; больше — разбивается по страницам.</p>
        </div>

        <div class="pd-row">
          <span class="pd-label">Ориентация страницы</span>
          <div class="pd-seg">
            <button
              type="button"
              :class="['pd-seg-btn', { active: state.orientation === 'portrait' }]"
              @click="state.orientation = 'portrait'"
            >
              Портрет
            </button>
            <button
              type="button"
              :class="['pd-seg-btn', { active: state.orientation === 'landscape' }]"
              @click="state.orientation = 'landscape'"
            >
              Ландшафт
            </button>
          </div>
        </div>

        <div class="pd-actions">
          <button type="button" class="pd-btn pd-cancel" @click="close">Отмена</button>
          <button type="button" class="pd-btn pd-primary" @click="run">{{ actionLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pd-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
}
.pd {
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.pd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.pd-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #2c3e50;
}
.pd-close {
  border: none;
  background: none;
  font-size: 22px;
  line-height: 1;
  color: #7a8699;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.pd-close:hover {
  color: #1a73e8;
  background: #f1f4f9;
}
.pd-preview {
  background: #e8ebef;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-height: 120px;
  max-height: 40vh;
  overflow-y: auto;
}
.pd-empty {
  margin: auto;
  color: #7a8699;
  font-size: 13px;
}
.pd-page {
  position: relative;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  border-radius: 2px;
  overflow: hidden;
  flex-shrink: 0;
}
.pd-page-num {
  position: absolute;
  top: 4px;
  right: 6px;
  z-index: 5;
  font-size: 11px;
  font-weight: 700;
  color: #7a8699;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 4px;
  padding: 1px 6px;
}
.pd-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pd-label {
  font-size: 13px;
  font-weight: 600;
  color: #444;
}
.pd-seg {
  display: flex;
  gap: 8px;
}
.pd-seg-btn {
  flex: 1;
  padding: 9px 12px;
  border: 1px solid #d0d4da;
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  font-weight: 600;
  color: #444;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.pd-seg-btn.active {
  border-color: #1a73e8;
  background: #e8f0fe;
  color: #1a73e8;
}
.pd-range {
  width: 100%;
  accent-color: #1a73e8;
}
.pd-hint {
  margin: 0;
  font-size: 12px;
  color: #7a8699;
}
.pd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.pd-btn {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.pd-cancel {
  background: #f1f4f9;
  color: #444;
}
.pd-cancel:hover {
  background: #e4e9f0;
}
.pd-primary {
  background: #1a73e8;
  color: #fff;
}
.pd-primary:hover {
  background: #155cb8;
}
</style>

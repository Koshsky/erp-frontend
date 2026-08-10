<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useDiagramPrint } from '../../../composables/useDiagramPrint'
import { UNIT_OPTIONS } from '../../../composables/usePlanningOrigin'

const { state, run, close } = useDiagramPrint()

const title = computed(() => (state.mode === 'save' ? 'Сохранить в PDF' : 'Печать диаграммы'))
const actionLabel = computed(() => (state.mode === 'save' ? 'Сохранить PDF' : 'Печать'))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="state.open" class="pd-overlay" @mousedown.self="close">
      <div class="pd" role="dialog" aria-modal="true" aria-label="Печать диаграммы">
        <div class="pd-head">
          <h3 class="pd-title">{{ title }}</h3>
          <button type="button" class="pd-close" aria-label="Закрыть" @click="close">×</button>
        </div>

        <div class="pd-row">
          <span class="pd-label">Масштаб шкалы</span>
          <div class="pd-seg">
            <button
              v-for="o in UNIT_OPTIONS"
              :key="o.value"
              type="button"
              :class="['pd-seg-btn', { active: state.unit === o.value }]"
              @click="state.unit = o.value"
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
  max-width: 440px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../store'
import { ConfirmDialog } from '../components/common'
import { useConfirm } from '../composables/useConfirm'
import type { DtoAutoCreateConfig } from '@/api'

interface LocalResource {
  resource_id: number
  quantity: number
}
interface LocalTask {
  title: string
  resources: LocalResource[]
}
interface LocalProcess {
  title: string
  owner_id: number | null
  tasks: LocalTask[]
}

/** Template limits — mirrored from the backend (auto_create service) so the
 *  user gets the error before the PUT, with the same wording. */
const LIMITS = {
  maxProcesses: 20,
  maxTasksPerProcess: 50,
  maxResourcesPerTask: 10,
  maxAssignmentsTotal: 500,
  maxQuantity: 99,
} as const

const app = useAppStore()
const { autoCreateConfig, autoCreateLoading, autoCreateError, users, resources } = storeToRefs(app)

const form = reactive<{ enabled: boolean; processes: LocalProcess[] }>({ enabled: true, processes: [] })
const dirty = ref(false)
const saving = ref(false)
const saveMsg = ref<{ ok: boolean; text: string } | null>(null)
const previewOpen = ref(false)

const { confirm: confirmDialog, ask, proceed, cancel } = useConfirm()

/** Process owner candidates (excluding workers) */
const ownerOptions = computed(() =>
  users.value
    .filter((u) => u.role !== 'worker')
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
)

/** Task resource candidates */
const resourceOptions = computed(() =>
  resources.value
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ru'))
    .map((r) => ({ value: r.id as number, label: `${r.title}${r.code ? ` (${r.code})` : ''}` })),
)

function resourceLabel(id?: number): string {
  const r = resources.value.find((x) => x.id === id)
  return r ? `${r.title}${r.code ? ` (${r.code})` : ''}` : '—'
}

/** Live summary of what a new project would get from the current template */
const preview = computed(() => {
  let tasks = 0
  let assignments = 0
  for (const p of form.processes) {
    tasks += p.tasks.length
    for (const t of p.tasks) assignments += t.resources.length
  }
  return { processes: form.processes.length, tasks, assignments }
})

function resetForm() {
  const cfg = autoCreateConfig.value
  form.enabled = cfg?.enabled ?? true
  form.processes = (cfg?.processes ?? []).map((p) => ({
    title: p.title ?? '',
    owner_id: p.owner_id ?? null,
    tasks: (p.tasks ?? []).map((t) => ({
      title: t.title ?? '',
      resources: (t.resources ?? []).map((r) => ({ resource_id: r.resource_id ?? 0, quantity: r.quantity ?? 1 })),
    })),
  }))
  dirty.value = false
  saving.value = false
  saveMsg.value = null
  previewOpen.value = false
}

watch(autoCreateConfig, () => {
  // Reload the form when the config arrives/changes externally, but keep a
  // successful save message (our own save also updates autoCreateConfig).
  if (autoCreateConfig.value && !saveMsg.value?.ok) resetForm()
})

async function reload() {
  saveMsg.value = null
  await app.loadAutoCreateConfig()
  if (autoCreateConfig.value) {
    if (!users.value.length) await app.loadUsers()
    if (!resources.value.length) await app.loadResources()
    resetForm()
  }
}

onMounted(() => {
  void reload()
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

// === Unsaved-changes protection (U1) ===
let allowLeave = false

/** Browser close/reload with unsaved changes — native confirmation */
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!dirty.value) return
  e.preventDefault()
  e.returnValue = ''
}

/** Route change with unsaved changes — in-app confirmation dialog */
onBeforeRouteLeave((_to, _from, next) => {
  if (!dirty.value || allowLeave) {
    next()
    return
  }
  ask('Есть несохранённые изменения. Выйти без сохранения?', () => {
    allowLeave = true
    next()
  }, 'Выйти')
  // Navigation stays pending until the user decides (next() in the callback).
})

function addProcess() {
  form.processes.push({ title: '', owner_id: null, tasks: [] })
  dirty.value = true
}

/** Removes a process; a process with tasks asks for confirmation first */
function removeProcess(i: number) {
  const p = form.processes[i]
  if (!p) return
  if (p.tasks.length) {
    ask(`Удалить процесс «${p.title || `#${i + 1}`}» вместе с ${p.tasks.length} задач(ами)?`, () => {
      form.processes.splice(i, 1)
      dirty.value = true
    }, 'Удалить')
    return
  }
  form.processes.splice(i, 1)
  dirty.value = true
}

/** Swaps a process with its neighbour (order is shown in the scheduler) */
function moveProcess(i: number, dir: -1 | 1) {
  const target = i + dir
  if (target < 0 || target >= form.processes.length) return
  const tmp = form.processes[i]
  form.processes[i] = form.processes[target]
  form.processes[target] = tmp
  dirty.value = true
}

function addTask(p: LocalProcess) {
  p.tasks.push({ title: '', resources: [] })
  dirty.value = true
}

/** Removes a task; a task with resources asks for confirmation first */
function removeTask(p: LocalProcess, ti: number) {
  const t = p.tasks[ti]
  if (!t) return
  if (t.resources.length) {
    ask(`Удалить задачу «${t.title || `#${ti + 1}`}» вместе с ${t.resources.length} ресурсами?`, () => {
      p.tasks.splice(ti, 1)
      dirty.value = true
    }, 'Удалить')
    return
  }
  p.tasks.splice(ti, 1)
  dirty.value = true
}

/** Swaps a task with its neighbour within the process */
function moveTask(pi: number, ti: number, dir: -1 | 1) {
  const p = form.processes[pi]
  const target = ti + dir
  if (!p || target < 0 || target >= p.tasks.length) return
  const tmp = p.tasks[ti]
  p.tasks[ti] = p.tasks[target]
  p.tasks[target] = tmp
  dirty.value = true
}

function addResource(t: LocalTask) {
  t.resources.push({ resource_id: 0, quantity: 1 })
  dirty.value = true
}
function removeResource(t: LocalTask, ri: number) {
  t.resources.splice(ri, 1)
  dirty.value = true
}

function validate(): string | null {
  if (form.processes.length > LIMITS.maxProcesses) {
    return `Слишком много процессов: максимум ${LIMITS.maxProcesses}`
  }
  let totalAssignments = 0
  for (let pi = 0; pi < form.processes.length; pi++) {
    const p = form.processes[pi]
    if (!p.title.trim()) return `Процесс ${pi + 1}: укажите название`
    if (p.tasks.length > LIMITS.maxTasksPerProcess) {
      return `Процесс «${p.title}»: слишком много задач: максимум ${LIMITS.maxTasksPerProcess}`
    }
    for (let ti = 0; ti < p.tasks.length; ti++) {
      const t = p.tasks[ti]
      if (!t.title.trim()) return `Процесс «${p.title}», задача ${ti + 1}: укажите название`
      if (t.resources.length > LIMITS.maxResourcesPerTask) {
        return `Задача «${t.title}»: слишком много ресурсов: максимум ${LIMITS.maxResourcesPerTask}`
      }
      totalAssignments += t.resources.length
      const seen = new Set<number>()
      for (let ri = 0; ri < t.resources.length; ri++) {
        const r = t.resources[ri]
        if (!r.resource_id) return `Задача «${t.title}»: выберите ресурс ${ri + 1}`
        if (seen.has(r.resource_id)) return `Задача «${t.title}»: ресурс «${resourceLabel(r.resource_id)}» указан дважды`
        if (r.quantity <= 0) return `Задача «${t.title}»: количество должно быть больше 0`
        if (r.quantity > LIMITS.maxQuantity) {
          return `Задача «${t.title}»: количество не больше ${LIMITS.maxQuantity}`
        }
        seen.add(r.resource_id)
      }
    }
  }
  if (totalAssignments > LIMITS.maxAssignmentsTotal) {
    return `Слишком много назначений ресурсов: максимум ${LIMITS.maxAssignmentsTotal}`
  }
  return null
}

async function onSave() {
  if (saving.value || !dirty.value) return
  const err = validate()
  if (err) {
    saveMsg.value = { ok: false, text: err }
    return
  }
  saving.value = true
  saveMsg.value = null
  const ok = await app.saveAutoCreateConfig({
    enabled: form.enabled,
    processes: form.processes.map((p) => ({
      title: p.title.trim(),
      owner_id: p.owner_id ?? undefined,
      tasks: p.tasks.map((t) => ({
        title: t.title.trim(),
        resources: t.resources.map((r) => ({ resource_id: r.resource_id, quantity: r.quantity })),
      })),
    })),
  })
  saving.value = false
  saveMsg.value = { ok, text: ok ? 'Сохранено' : (autoCreateError.value ?? 'Ошибка сохранения') }
  if (ok) dirty.value = false
}
</script>

<template>
  <section class="ac">
    <div class="ac-head">
      <h2 class="ac-title">Автосоздание проектов</h2>
      <p class="ac-hint">При создании проекта автоматически создаются процессы (с владельцем) и их задачи с назначенными ресурсами.</p>
    </div>

    <p v-if="autoCreateLoading && !autoCreateConfig" class="ac-st">Загрузка...</p>

    <div v-else-if="autoCreateError && !autoCreateConfig" class="ac-st ac-er" role="alert">
      Не удалось загрузить конфигурацию: {{ autoCreateError }}
      <button type="button" class="ac-retry" @click="reload">Повторить</button>
    </div>

    <div v-if="autoCreateConfig" class="ac-form">
      <label class="ac-enable">
        <input type="checkbox" v-model="form.enabled" @change="dirty = true" />
        Автосоздание включено
      </label>

      <!-- Live preview of what a new project will get from the template -->
      <div class="ac-preview">
        <button type="button" class="ac-preview-toggle" @click="previewOpen = !previewOpen" :aria-expanded="previewOpen">
          Превью: {{ preview.processes }} процесс(а/ов) · {{ preview.tasks }} задач(и) · {{ preview.assignments }} назначения(й)
          <span class="ac-preview-caret">{{ previewOpen ? '▾' : '▸' }}</span>
        </button>
        <div v-if="!form.enabled" class="ac-preview-off">Автосоздание выключено — шаблон не применяется</div>
        <div v-if="previewOpen" class="ac-preview-tree">
          <div v-if="!form.processes.length" class="ac-preview-empty">
            Шаблон пуст — при создании проекта ничего не добавляется
          </div>
          <div v-for="(p, pi) in form.processes" :key="pi" class="ac-preview-node">
            <div class="ac-preview-p">{{ p.title || `Процесс ${pi + 1}` }}</div>
            <div v-for="(t, ti) in p.tasks" :key="ti" class="ac-preview-task">
              <span class="ac-preview-t">{{ t.title || `Задача ${ti + 1}` }}</span>
              <span v-if="t.resources.length" class="ac-preview-res">
                {{ t.resources.map((r) => `${resourceLabel(r.resource_id)} × ${r.quantity}`).join(', ') }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-for="(p, pi) in form.processes" :key="pi" class="ac-process">
        <div class="ac-process-head">
          <button type="button" class="ac-move" :disabled="pi === 0" @click="moveProcess(pi, -1)" aria-label="Переместить процесс вверх">↑</button>
          <button type="button" class="ac-move" :disabled="pi === form.processes.length - 1" @click="moveProcess(pi, 1)" aria-label="Переместить процесс вниз">↓</button>
          <input v-model="p.title" type="text" class="ac-input ac-title-input" placeholder="Название процесса" aria-label="Название процесса" @input="dirty = true" />
          <select v-model="p.owner_id" class="ac-input ac-owner" aria-label="Владелец процесса" @change="dirty = true">
            <option :value="null">Владелец не выбран</option>
            <option v-for="opt in ownerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <button type="button" class="ac-del" @click="removeProcess(pi)">Удалить процесс</button>
        </div>
        <p v-if="p.owner_id == null" class="ac-owner-hint">Владелец не выбран — процесс создастся без владельца</p>

        <div class="ac-tasks">
          <div v-for="(t, ti) in p.tasks" :key="ti" class="ac-task">
            <div class="ac-task-head">
              <button type="button" class="ac-move" :disabled="ti === 0" @click="moveTask(pi, ti, -1)" aria-label="Переместить задачу вверх">↑</button>
              <button type="button" class="ac-move" :disabled="ti === p.tasks.length - 1" @click="moveTask(pi, ti, 1)" aria-label="Переместить задачу вниз">↓</button>
              <input v-model="t.title" type="text" class="ac-input" placeholder="Название задачи" aria-label="Название задачи" @input="dirty = true" />
              <button type="button" class="ac-del" @click="removeTask(p, ti)">×</button>
            </div>
            <div v-if="t.resources.length" class="ac-resources">
              <div v-for="(r, ri) in t.resources" :key="ri" class="ac-resource">
                <select v-model="r.resource_id" class="ac-input" aria-label="Ресурс" @change="dirty = true">
                  <option :value="0">Выбрать ресурс...</option>
                  <option v-for="opt in resourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <input v-model.number="r.quantity" type="number" min="1" :max="LIMITS.maxQuantity" class="ac-input ac-qty" aria-label="Количество" @input="dirty = true" />
                <button type="button" class="ac-del" @click="removeResource(t, ri)">×</button>
              </div>
            </div>
            <button type="button" class="ac-add-sm" @click="addResource(t)">+ ресурс</button>
          </div>
          <button type="button" class="ac-add-sm" @click="addTask(p)">+ задача</button>
        </div>
      </div>

      <button type="button" class="ac-add" @click="addProcess">Добавить процесс</button>

      <div class="ac-actions">
        <button type="button" class="ac-save" :disabled="saving || !dirty" @click="onSave">Сохранить</button>
        <button v-if="dirty" type="button" class="ac-cancel" :disabled="saving" @click="resetForm">Отменить</button>
        <p v-if="saveMsg" class="ac-msg" :class="saveMsg.ok ? 'ok' : 'er'">{{ saveMsg.text }}</p>
      </div>
    </div>

    <ConfirmDialog
      :open="!!confirmDialog"
      :message="confirmDialog?.message ?? ''"
      :confirm-label="confirmDialog?.confirmLabel"
      @confirm="proceed"
      @close="cancel"
    />
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.ac-head {
  margin-bottom: 20px;
}
.ac-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ui-text);
  margin: 0 0 6px;
}
.ac-hint {
  margin: 0;
  font-size: 13px;
  color: var(--ui-text-muted);
}
.ac-st {
  color: var(--ui-text-muted);
  font-size: 14px;
  padding: 30px;
  text-align: center;
}
.ac-st.ac-er {
  color: var(--ui-danger);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.ac-retry {
  border: 1px solid var(--ui-danger-soft);
  background: var(--ui-danger-soft);
  color: var(--ui-danger);
  border-radius: var(--ui-radius-sm);
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
}
.ac-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ac-enable {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ui-text);
}
.ac-preview {
  background: var(--ui-surface-2);
  border: 1px dashed var(--ui-border-strong);
  border-radius: 10px;
  padding: 10px 14px;
}
.ac-preview-toggle {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-accent);
  cursor: pointer;
  font-family: inherit;
}
.ac-preview-caret {
  margin-left: 4px;
  color: var(--ui-text-muted);
}
.ac-preview-off {
  margin-top: 8px;
  font-size: 12px;
  color: var(--ui-warning);
  font-weight: 600;
}
.ac-preview-tree {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.ac-preview-empty {
  color: var(--ui-text-muted);
}
.ac-preview-p {
  font-weight: 600;
  color: var(--ui-text);
}
.ac-preview-task {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 14px;
}
.ac-preview-t {
  color: var(--ui-text-2);
}
.ac-preview-res {
  color: var(--ui-text-muted);
  font-size: 12px;
}
.ac-process {
  background: var(--ui-surface);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 16px;
}
.ac-process-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.ac-title-input {
  flex: 1;
}
.ac-owner {
  width: 240px;
}
.ac-owner-hint {
  margin: -6px 0 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.ac-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
  border-left: 2px solid var(--ui-border);
}
.ac-task {
  background: var(--ui-surface-2);
  border-radius: var(--ui-radius-sm);
  padding: 10px;
}
.ac-task-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-task-head .ac-input {
  flex: 1;
}
.ac-move {
  border: 1px solid var(--ui-border-strong);
  border-radius: 6px;
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 7px;
}
.ac-move:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ac-resources {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  padding-left: 8px;
}
.ac-resource {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ac-resource select {
  flex: 1;
}
.ac-qty {
  width: 70px;
}
.ac-input {
  box-sizing: border-box;
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--ui-text);
  background: var(--ui-surface);
  outline: none;
}
.ac-input:focus {
  border-color: var(--ui-accent);
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ac-add,
.ac-add-sm {
  border: 1px solid var(--ui-accent-soft);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
  border-radius: var(--ui-radius-sm);
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;
}
.ac-add-sm {
  padding: 5px 10px;
  margin-top: 4px;
}
.ac-del {
  border: none;
  background: transparent;
  color: var(--ui-danger);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.ac-del:hover {
  background: var(--ui-danger-soft);
}
.ac-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.ac-save {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 22px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.ac-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ac-cancel {
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 8px 16px;
  font-size: 14px;
  color: var(--ui-text-2);
  cursor: pointer;
}
.ac-msg {
  margin: 0;
  font-size: 14px;
}
.ac-msg.ok {
  color: var(--ui-success);
}
.ac-msg.er {
  color: var(--ui-danger);
}
</style>
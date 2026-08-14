<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '../store'
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

const app = useAppStore()
const { autoCreateConfig, autoCreateLoading, autoCreateError, users, resources } = storeToRefs(app)

const form = reactive<{ enabled: boolean; processes: LocalProcess[] }>({ enabled: true, processes: [] })
const dirty = ref(false)
const saving = ref(false)
const saveMsg = ref<{ ok: boolean; text: string } | null>(null)

/** Кандидаты во владельцы процесса (без workers) */
const ownerOptions = computed(() =>
  users.value
    .filter((u) => u.role !== 'worker')
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'))
    .map((u) => ({ value: u.id as number, label: u.name ?? `#${u.id}` })),
)

/** Кандидаты в ресурсы задачи */
const resourceOptions = computed(() =>
  resources.value
    .sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '', 'ru'))
    .map((r) => ({ value: r.id as number, label: `${r.title}${r.code ? ` (${r.code})` : ''}` })),
)

function resourceLabel(id?: number): string {
  const r = resources.value.find((x) => x.id === id)
  return r ? `${r.title}${r.code ? ` (${r.code})` : ''}` : '—'
}

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
  saveMsg.value = null
}

watch(autoCreateConfig, () => {
  if (autoCreateConfig.value) resetForm()
})

onMounted(async () => {
  await app.loadAutoCreateConfig()
  if (!users.value.length) await app.loadUsers()
  if (!resources.value.length) await app.loadResources()
  resetForm()
})

function addProcess() {
  form.processes.push({ title: '', owner_id: null, tasks: [] })
  dirty.value = true
}
function removeProcess(i: number) {
  form.processes.splice(i, 1)
  dirty.value = true
}
function addTask(p: LocalProcess) {
  p.tasks.push({ title: '', resources: [] })
  dirty.value = true
}
function removeTask(p: LocalProcess, ti: number) {
  p.tasks.splice(ti, 1)
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
  for (let pi = 0; pi < form.processes.length; pi++) {
    const p = form.processes[pi]
    if (!p.title.trim()) return `Процесс ${pi + 1}: укажите название`
    for (let ti = 0; ti < p.tasks.length; ti++) {
      const t = p.tasks[ti]
      if (!t.title.trim()) return `Процесс «${p.title}», задача ${ti + 1}: укажите название`
      const seen = new Set<number>()
      for (let ri = 0; ri < t.resources.length; ri++) {
        const r = t.resources[ri]
        if (!r.resource_id) return `Задача «${t.title}»: выберите ресурс ${ri + 1}`
        if (seen.has(r.resource_id)) return `Задача «${t.title}»: ресурс «${resourceLabel(r.resource_id)}» указан дважды`
        if (r.quantity <= 0) return `Задача «${t.title}»: количество должно быть больше 0`
        seen.add(r.resource_id)
      }
    }
  }
  return null
}

async function onSave() {
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

    <div v-if="autoCreateConfig" class="ac-form">
      <label class="ac-enable">
        <input type="checkbox" v-model="form.enabled" @change="dirty = true" />
        Автосоздание включено
      </label>

      <div v-for="(p, pi) in form.processes" :key="pi" class="ac-process">
        <div class="ac-process-head">
          <input v-model="p.title" type="text" class="ac-input ac-title-input" placeholder="Название процесса" @input="dirty = true" />
          <select v-model="p.owner_id" class="ac-input ac-owner" @change="dirty = true">
            <option :value="null">Владелец не выбран</option>
            <option v-for="opt in ownerOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
          <button type="button" class="ac-del" @click="removeProcess(pi)">Удалить процесс</button>
        </div>

        <div class="ac-tasks">
          <div v-for="(t, ti) in p.tasks" :key="ti" class="ac-task">
            <div class="ac-task-head">
              <input v-model="t.title" type="text" class="ac-input" placeholder="Название задачи" @input="dirty = true" />
              <button type="button" class="ac-del" @click="removeTask(p, ti)">×</button>
            </div>
            <div v-if="t.resources.length" class="ac-resources">
              <div v-for="(r, ri) in t.resources" :key="ri" class="ac-resource">
                <select v-model="r.resource_id" class="ac-input" @change="dirty = true">
                  <option :value="0">Выбрать ресурс...</option>
                  <option v-for="opt in resourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <input v-model.number="r.quantity" type="number" min="1" class="ac-input ac-qty" @input="dirty = true" />
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
        <button type="button" class="ac-save" :disabled="saving" @click="onSave">Сохранить</button>
        <button v-if="dirty" type="button" class="ac-cancel" :disabled="saving" @click="resetForm">Отменить</button>
        <p v-if="saveMsg" class="ac-msg" :class="saveMsg.ok ? 'ok' : 'er'">{{ saveMsg.text }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ac-head {
  margin-bottom: 20px;
}
.ac-title {
  font-size: 24px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 6px;
}
.ac-hint {
  margin: 0;
  font-size: 13px;
  color: #888;
}
.ac-st {
  color: #666;
  font-size: 14px;
  padding: 30px;
  text-align: center;
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
  color: #333;
}
.ac-process {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
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
.ac-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-left: 8px;
  border-left: 2px solid #eef0f2;
}
.ac-task {
  background: #f8f9fa;
  border-radius: 8px;
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
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  font-family: inherit;
  color: #333;
  background: #fff;
  outline: none;
}
.ac-input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
}
.ac-add,
.ac-add-sm {
  border: 1px solid #cfe0fb;
  background: #eef4fd;
  color: #1a73e8;
  border-radius: 8px;
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
  color: #d93025;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.ac-del:hover {
  background: #fef2f1;
}
.ac-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.ac-save {
  border: none;
  border-radius: 8px;
  padding: 9px 22px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: #1a73e8;
  color: #fff;
}
.ac-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ac-cancel {
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  padding: 8px 16px;
  font-size: 14px;
  color: #555;
  cursor: pointer;
}
.ac-msg {
  margin: 0;
  font-size: 14px;
}
.ac-msg.ok {
  color: #1e8e3e;
}
.ac-msg.er {
  color: #d93025;
}
</style>

<script setup lang="ts">
/**
 * UserAccessPage — individual user permissions (zone overrides).
 * A separate page reached from the "Edit permissions" button of the user
 * editor (/users/:id/edit). A preset change is saved immediately (it is a
 * profile property), the overrides — with the "Save" button below.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { UserPermissionsEditor } from '../components/common'
import { useAppStore, useAuthStore, useRbacStore } from '../store'
import { builtinPresetOptions, presetDisplayName } from '../utils/presets'
import { t } from '../i18n'
import type { PermissionOverride } from '../components/common/UserPermissionsEditor/types'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const auth = useAuthStore()
const rbac = useRbacStore()
const { adminUsers } = storeToRefs(app)

const staticPresetOptions = () => builtinPresetOptions()
const presetOptions = computed(() =>
  rbac.presets.length
    ? rbac.presets.map((p) => ({ value: p.tag ?? '', label: presetDisplayName(p) }))
    : staticPresetOptions(),
)

/** Permission editing is admin-only (as on the user editor page). */
const permsReady = computed(() => rbac.permsLoaded || rbac.myPermissions.length > 0)
const canManageUserRights = computed(() =>
  permsReady.value ? rbac.can('rbac_config', 'view') : auth.user?.preset === 'admin',
)

const userId = computed(() => {
  const raw = route.params.id
  if (typeof raw !== 'string') return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
})

const loading = ref(true)
const missing = ref(false)
const user = ref<{ id: number; name: string; username: string; preset: string } | null>(null)

onMounted(async () => {
  void rbac.ensurePresets()
  await app.loadAdminUsers()
  loading.value = false
  const found = adminUsers.value.find((x) => x.id === userId.value)
  if (found) {
    user.value = {
      id: found.id ?? 0,
      name: found.name ?? found.username ?? `#${found.id}`,
      username: found.username ?? '',
      preset: found.preset ?? 'worker',
    }
  } else {
    missing.value = true
  }
})

/* ── overrides (staged) + saving ─────────────── */
const permissionOverrides = ref<PermissionOverride[]>([])
const permissionDirty = ref(false)
const permissionSaved = ref(false)

async function savePermissions(): Promise<boolean> {
  const id = userId.value
  if (id == null) return false
  // A failed save is reported by the global toast (http.ts), not inline.
  const ok = await rbac.saveUserPermissions(id, permissionOverrides.value)
  if (!ok) return false
  permissionDirty.value = false
  permissionSaved.value = true
  // Refresh the server snapshot so the yellow "changed" rows clear — a row is
  // highlighted only while the frontend staged value differs from the backend.
  void rbac.loadUserPermissions(id)
  return true
}

/** A preset change on the permissions page is saved immediately (it is a
 *  profile property). Save errors go to the global toast (http.ts). */
function onChangePreset(preset: string) {
  const id = userId.value
  if (id == null || user.value == null || user.value.preset === preset) return
  user.value.preset = preset
  void app.updateUser(id, { preset })
}

watch(permissionDirty, (dirty) => {
  if (dirty) permissionSaved.value = false
})
</script>

<template>
  <section class="ua">
    <div class="ua-head">
      <h2 class="ua-title">{{ t('adminUsers.userAccess.title', { name: user?.name ?? '…' }) }}</h2>
      <button type="button" class="ua-back" @click="router.push(`/users/${userId}/edit`)">
        {{ t('adminUsers.userAccess.back') }}
      </button>
    </div>

    <p v-if="loading" class="ua-st">{{ t('common.loading') }}</p>
    <div v-else-if="missing" class="ua-st">
      <p class="ua-error">{{ t('adminUsers.userAccess.missing') }}</p>
    </div>

    <p v-else-if="!canManageUserRights" class="ua-st">
      {{ t('adminUsers.userAccess.denied') }}
    </p>

    <div v-else class="ua-card">
      <UserPermissionsEditor
        mode="user"
        :user-id="userId ?? 0"
        :preset="user?.preset ?? 'worker'"
        :preset-options="presetOptions"
        @update:preset="onChangePreset"
        @update:overrides="permissionOverrides = $event"
        @update:dirty="permissionDirty = $event"
      />

      <div class="ua-actions">
        <p v-if="permissionSaved" class="ua-ok" role="status">{{ t('adminUsers.userAccess.saved') }}</p>
        <button
          type="button"
          class="ua-save"
          :disabled="!permissionDirty || rbac.saving"
          @click="savePermissions"
        >
          {{ rbac.saving ? t('adminUsers.userForm.action.saving') : t('common.save') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';
.ua {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}
.ua-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ua-title {
  font-size: calc(var(--ui-font-scale, 1) * 20px);
  font-weight: 700;
  color: var(--ui-text);
  margin: 0;
}
.ua-back {
  border: 1px solid var(--ui-border-strong);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-surface);
  padding: 7px 14px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-accent);
  cursor: pointer;
}
.ua-back:hover {
  background: var(--ui-accent-soft);
}
.ua-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ua-st {
  color: var(--ui-text-2);
  font-size: calc(var(--ui-font-scale, 1) * 14px);
  padding: 30px;
  text-align: center;
}
.ua-error {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-danger);
}
.ua-ok {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  color: var(--ui-success, #22c55e);
}
.ua-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.ua-save {
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 9px 18px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 600;
  cursor: pointer;
  background: var(--ui-accent);
  color: var(--ui-accent-on);
}
.ua-save:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
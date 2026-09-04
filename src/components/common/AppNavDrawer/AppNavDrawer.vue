<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { NavCategory, NavItem } from '../../../composables/useNavigation'
import { NAV_WIDTH } from '../../../composables/useNavDrawer'
import { AppIcon, type AppIconName } from '../AppIcon'
import type { AppNavDrawerEmits, AppNavDrawerProps } from './types'

const props = withDefaults(defineProps<AppNavDrawerProps>(), { brand: 'MVS ERP' })
const emit = defineEmits<AppNavDrawerEmits>()

// ---------------------------------------------------------------------------
// Collapsed groups — persisted per group label so the layout survives reloads.
// Any group can be collapsed, including the one holding the active route.
// When navigation moves into another group it is auto-expanded (the current
// context should be visible), but a manually collapsed active group stays
// collapsed until the user expands it or moves to another section.
// ---------------------------------------------------------------------------
const COLLAPSED_KEY = 'mvs_erp_nav_collapsed'

function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch {
    // storage unavailable or corrupted — start collapsed-free
  }
  return new Set()
}

const collapsed = ref<Set<string>>(readCollapsed())

function persistCollapsed(): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed.value]))
  } catch {
    // persistence is not critical
  }
}

const activeCategory = computed<NavCategory | undefined>(() =>
  props.categories.find((c) => c.items.some((i) => i.name === props.activeName)),
)

/** A group is open purely by the user's choice (persisted per label) */
function isOpen(cat: NavCategory): boolean {
  return !collapsed.value.has(cat.label)
}

function toggleGroup(cat: NavCategory): void {
  if (collapsed.value.has(cat.label)) collapsed.value.delete(cat.label)
  else collapsed.value.add(cat.label)
  persistCollapsed()
}

// Auto-expand the group the user navigated into (route change), so the active
// context is never hidden behind a collapsed header.
watch(activeCategory, (cat) => {
  if (cat && collapsed.value.has(cat.label)) {
    collapsed.value.delete(cat.label)
    persistCollapsed()
  }
})

/* ---------------------------------------------------------------------------
 * Group expand/collapse transitions.
 * The visible height of the clip container animates between 0 and the real
 * scrollHeight while the content fades. The clip has `overflow: hidden`, so
 * the items themselves never move or squash — the block closes like a
 * curtain and sibling section headers slide smoothly.
 * ---------------------------------------------------------------------------
 */
function onBeforeEnter(el: Element): void {
  const e = el as HTMLElement
  e.style.height = '0px'
  e.style.opacity = '0'
}

function onEnter(el: Element): void {
  const e = el as HTMLElement
  // Next frame: browser has painted the 0 state, now animate to full height
  requestAnimationFrame(() => {
    e.style.height = `${e.scrollHeight}px`
    e.style.opacity = '1'
  })
}

function onBeforeLeave(el: Element): void {
  const e = el as HTMLElement
  e.style.height = `${e.scrollHeight}px`
}

function onLeave(el: Element): void {
  const e = el as HTMLElement
  requestAnimationFrame(() => {
    e.style.height = '0px'
    e.style.opacity = '0'
  })
}

/** Drop inline height/opacity once the transition finishes (back to auto) */
function onAfterClear(el: Element): void {
  const e = el as HTMLElement
  e.style.height = ''
  e.style.opacity = ''
}

// ---------------------------------------------------------------------------
// Icons: route name -> icon (default: generic list icon for unknown items)
// ---------------------------------------------------------------------------
const ITEM_ICONS: Record<string, AppIconName> = {
  projects: 'kanban',
  processes: 'flow',
  planner: 'checklist',
  timesheet: 'calendar',
  employees: 'users',
  resources: 'cpu',
  users: 'user-circle',
  structure: 'org',
  'auto-create': 'sparkles',
  statuses: 'tag',
  permissions: 'key',
  audit: 'scroll',
  sync: 'refresh',
  profile: 'user',
}

function iconFor(item: NavItem): AppIconName {
  return ITEM_ICONS[item.name] ?? 'list'
}
</script>

<template>
  <!-- Scrim for the narrow-screen (overlay) mode; invisible on desktop where
       the drawer is a real layout column -->
  <div
    class="nd-overlay"
    :class="{ 'nd-overlay--on': props.open }"
    @click="emit('close')"
  ></div>

  <aside
    class="nd"
    :class="{ 'nd--open': props.open }"
    role="navigation"
    aria-label="Разделы"
  >
    <div class="nd-inner">
      <!-- Drawer header: the only place the product brand lives. Closing the
           drawer is done by the burger (which turns into an ×), Escape, a
           menu item click, or the scrim on narrow screens -->
      <div class="nd-top">
        <div class="nd-brand">{{ props.brand }}</div>
      </div>

      <nav class="nd-scroll">
        <section
          v-for="cat in props.categories"
          :key="cat.label"
          class="nd-group"
          :class="{ 'nd-group--open': isOpen(cat) }"
        >
          <button
            type="button"
            class="nd-group-head"
            :aria-expanded="isOpen(cat)"
            @click="toggleGroup(cat)"
          >
            <span class="nd-group-title">{{ cat.label }}</span>
            <AppIcon name="chevron-down" :size="16" class="nd-caret" />
          </button>
          <Transition
            :duration="320"
            @before-enter="onBeforeEnter"
            @enter="onEnter"
            @after-enter="onAfterClear"
            @before-leave="onBeforeLeave"
            @leave="onLeave"
            @after-leave="onAfterClear"
          >
            <div v-show="isOpen(cat)" :key="cat.label" class="nd-items-clip">
              <div class="nd-items">
                <RouterLink
                  v-for="item in cat.items"
                  :key="item.to"
                  :to="item.to"
                  class="nd-item"
                  :class="{ active: item.name === props.activeName }"
                  @click="emit('close')"
                >
                  <AppIcon :name="iconFor(item)" :size="22" />
                  <span class="nd-item-label">{{ item.label }}</span>
                  <span v-if="item.badge" class="nd-badge">{{ item.badge }}</span>
                </RouterLink>
              </div>
            </div>
          </Transition>
        </section>
      </nav>

      <!-- System section (desktop/Electron): sync status + the sync page -->
      <div v-if="props.sync?.enabled" class="nd-foot">
        <div class="nd-status">
          <span class="nd-dot" :class="{ 'nd-dot--off': props.sync.offline }"></span>
          <span>
            {{
              props.sync.offline && props.sync.lastPullLabel
                ? `Офлайн · данные от ${props.sync.lastPullLabel}`
                : `Онлайн · данные ${props.sync.lastPullLabel ?? '—'}`
            }}
          </span>
        </div>
        <RouterLink
          to="/sync"
          class="nd-item"
          :class="{ active: props.activeName === 'sync' }"
          @click="emit('close')"
        >
          <AppIcon name="refresh" :size="22" />
          <span class="nd-item-label">Синхронизация</span>
          <span v-if="props.sync.pending > 0" class="nd-badge nd-badge--num">
            {{ props.sync.pending }}
          </span>
        </RouterLink>
      </div>
    </div>
  </aside>
</template>

<style scoped>
@import '../../../styles/tokens.css';

/* Desktop: the drawer is a real layout column. Its outer width animates
   between 0 and NAV_WIDTH, shifting the content column; the inner panel is
   fixed-width so items never reflow while the column opens. */
.nd {
  flex: none;
  height: 100%;
  width: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
  transition:
    width 0.33s cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s linear 0.33s;
}

.nd--open {
  width: v-bind('NAV_WIDTH + "px"');
  visibility: visible;
  pointer-events: auto;
  /* visibility flips immediately on open, delayed 0.33s on close */
  transition:
    width 0.33s cubic-bezier(0.16, 1, 0.3, 1),
    visibility 0s;
}

/* Fixed inner width: content never squashes while the column animates */
.nd-inner {
  width: v-bind('NAV_WIDTH + "px"');
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ui-surface);
  color: var(--ui-text);
  border-right: 1px solid var(--ui-border);
}

/* Scrim: only in the narrow overlay mode (see media query below) */
.nd-overlay {
  display: none;
}

.nd-top {
  flex: none;
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--ui-surface-3);
}

.nd-brand {
  font-size: 20px;
  font-weight: 750;
  letter-spacing: 0.2px;
  color: var(--ui-text);
  white-space: nowrap;
}

.nd-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 10px 22px;
}

.nd-group {
  margin-bottom: 4px;
}

.nd-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 10px 9px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  transition: background var(--ui-duration);
}

.nd-group-head:hover {
  background: var(--ui-surface-2);
}

.nd-group-title {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--ui-text-faint);
}

.nd-caret {
  color: var(--ui-text-faint);
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.nd-group--open .nd-caret {
  transform: rotate(180deg);
}

/* Expand/collapse clip: the CONTAINER height animates (0 <-> full height),
   content only fades; overflow hidden guarantees items never move/squash */
.nd-items-clip {
  overflow: hidden;
  transition:
    height 0.3s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease;
  will-change: height;
}

.nd-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0 8px;
}

.nd-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 42px;
  padding: 0 12px 0 16px;
  border-radius: 8px;
  color: var(--ui-text-2);
  text-decoration: none;
  font-size: 15px;
  font-family: inherit;
  transition: background var(--ui-duration), color var(--ui-duration);
}

.nd-item :deep(svg) {
  color: var(--ui-text-faint);
  transition: color var(--ui-duration);
}

.nd-item:hover {
  background: var(--ui-surface-3);
  color: var(--ui-text);
}

.nd-item:hover :deep(svg) {
  color: var(--ui-text-2);
}

.nd-item.active {
  background: var(--ui-accent-soft);
  color: var(--ui-text);
  font-weight: 600;
}

.nd-item.active :deep(svg) {
  color: var(--ui-accent);
}

/* Thin accent bar on the left of the active item — quiet, not loud */
.nd-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 9px;
  bottom: 9px;
  width: 3px;
  border-radius: 2px;
  background: var(--ui-accent);
}

.nd-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nd-badge {
  flex: none;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}

.nd-badge--num {
  background: var(--ui-warning-soft);
  color: var(--ui-warning);
}

.nd-foot {
  flex: none;
  border-top: 1px solid var(--ui-border);
  padding: 10px 10px 14px;
}

.nd-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px 9px;
  font-size: 13px;
  color: var(--ui-text-muted);
}

.nd-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--ui-success);
}

.nd-dot--off {
  background: var(--ui-warning);
}

/* ---------------------------------------------------------------------------
 * Narrow screens: the drawer becomes a classic overlay (fixed, slides over
 * the content with a scrim) — shifting the content is impractical there.
 * ---------------------------------------------------------------------------
 */
@media (max-width: 720px) {
  .nd-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 34990;
    background: rgba(15, 23, 42, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--ui-duration) ease;
  }

  .nd-overlay--on {
    opacity: 1;
    pointer-events: auto;
  }

  .nd {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 35000;
    width: min(280px, 92vw);
    height: auto;
    overflow: visible;
    visibility: visible;
    pointer-events: auto;
    transform: translateX(-104%);
    transition: transform 0.33s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nd--open {
    width: min(280px, 92vw);
    transform: translateX(0);
    transition: transform 0.33s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .nd-inner {
    width: auto;
    box-shadow: var(--ui-shadow-lg);
  }
}

/* Custom dark-mode scrim (narrow mode only) */
:root[data-scheme='dark'] .nd-overlay {
  background: rgba(0, 0, 0, 0.55);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-scheme='light']) .nd-overlay {
    background: rgba(0, 0, 0, 0.55);
  }
}
</style>
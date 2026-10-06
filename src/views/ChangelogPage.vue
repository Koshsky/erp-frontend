<script setup lang="ts">
/**
 * Changelog page: renders the Russian changelog (Changelog_RU.md — the file
 * maintained with every release) through the shared safe MarkdownView. Opened
 * in a separate browser tab from the header icon (name: changelog).
 */
import changelogRu from '../../Changelog_RU.md?raw'
import { AppIcon } from '../components/common'
import { MarkdownView } from '../components/common/MarkdownView'

const appVersion = __APP_VERSION__
</script>

<template>
  <section class="cl">
    <div class="cl-inner">
      <header class="cl-head">
        <span class="cl-head-ic" aria-hidden="true">
          <AppIcon name="scroll" :size="24" />
        </span>
        <div class="cl-head-text">
          <h1 class="cl-title">Журнал изменений</h1>
          <p class="cl-version">Текущая версия: v{{ appVersion }}</p>
        </div>
      </header>

      <div class="cl-card">
        <MarkdownView :source="changelogRu" />
      </div>
    </div>
  </section>
</template>

<style scoped>
@import '../styles/tokens.css';

.cl {
  background: var(--ui-surface-2);
  min-height: 100%;
  padding: 28px 20px 48px;
}

.cl-inner {
  max-width: 860px;
  margin: 0 auto;
}

.cl-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 22px;
}

.cl-head-ic {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: var(--ui-radius-md);
  background: var(--ui-accent-soft);
  color: var(--ui-accent);
}

.cl-head-text {
  min-width: 0;
}

.cl-title {
  margin: 0;
  font-size: calc(var(--ui-font-scale, 1) * 26px);
  font-weight: 700;
  color: var(--ui-text);
}

.cl-version {
  margin: 4px 0 0;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  color: var(--ui-text-2);
}

/* The changelog "scroll": surface card with the release sections inside. */
.cl-card {
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: 30px 40px 36px;
}

/* Release-specific typography on top of the shared MarkdownView styles. */
.cl-card :deep(.mdv) {
  font-size: calc(var(--ui-font-scale, 1) * 15px);
}

/* A release heading (## [1.2.0] - date): large, with an accent underline */
.cl-card :deep(.mdv h2) {
  margin: 40px 0 6px;
  padding-bottom: 12px;
  font-size: calc(var(--ui-font-scale, 1) * 23px);
  font-weight: 700;
  color: var(--ui-text);
  border-bottom: 2px solid var(--ui-accent-soft);
}

.cl-card :deep(.mdv h2:first-child) {
  margin-top: 6px;
}

/* A change-type section (### Изменено / Исправлено / …): small caps accent */
.cl-card :deep(.mdv h3) {
  margin: 26px 0 10px;
  font-size: calc(var(--ui-font-scale, 1) * 13px);
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--ui-accent);
}

.cl-card :deep(.mdv ul) {
  padding-left: 22px;
}

.cl-card :deep(.mdv li) {
  margin-bottom: 7px;
  line-height: 1.55;
  color: var(--ui-text);
}

@media (max-width: 720px) {
  .cl {
    padding: 18px 10px 32px;
  }

  .cl-card {
    padding: 20px 18px 24px;
  }

  .cl-head-ic {
    width: 44px;
    height: 44px;
  }
}
</style>
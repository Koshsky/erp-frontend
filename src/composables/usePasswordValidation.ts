import { computed, type Ref } from 'vue'

/** Одно правило валидации пароля. Расширяется добавлением правила в passwordRules. */
export interface PasswordRule {
  id: string
  label: string
  /** Проверка пароля; true — правило выполнено */
  test: (value: string) => boolean
}

const DEFAULT_RULES: PasswordRule[] = [
  { id: 'length', label: 'не меньше 8 символов', test: (v) => v.length >= 8 },
  { id: 'lower', label: 'строчные буквы', test: (v) => /[a-z]/.test(v) },
  { id: 'upper', label: 'заглавные буквы', test: (v) => /[A-Z]/.test(v) },
  { id: 'digit', label: 'цифры', test: (v) => /\d/.test(v) },
  { id: 'special', label: 'спецсимволы', test: (v) => /[^A-Za-z0-9]/.test(v) },
]

/** Набор правил пароля (по умолчанию: длина, регистры, цифры, спецсимволы). */
export function passwordRules(custom?: PasswordRule[]): PasswordRule[] {
  return custom && custom.length ? custom : DEFAULT_RULES
}

/** Валидация пароля против набора правил. */
export function validatePassword(value: string, rules: PasswordRule[]): boolean {
  return rules.every((r) => r.test(value))
}

/** Проверка пароля с реактивным списком выполненности правил. */
export function usePasswordValidation(
  value: Ref<string>,
  rules: Ref<PasswordRule[]> | PasswordRule[] = DEFAULT_RULES,
) {
  const list = computed(() => {
    const items = Array.isArray(rules) ? rules : rules.value
    const password = value.value
    return items.map((r) => ({ rule: r, ok: r.test(password) }))
  })

  const valid = computed(() => list.value.every((i) => i.ok))

  return { list, valid }
}

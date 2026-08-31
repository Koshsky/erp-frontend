import { computed, type Ref } from 'vue'

/** A single password validation rule. Extended by adding a rule to passwordRules. */
export interface PasswordRule {
  id: string
  label: string
  /** Password check; true — rule satisfied */
  test: (value: string) => boolean
}

const DEFAULT_RULES: PasswordRule[] = [
  { id: 'length', label: 'не меньше 8 символов', test: (v) => v.length >= 8 },
  { id: 'lower', label: 'строчные буквы', test: (v) => /\p{Ll}/u.test(v) },
  { id: 'upper', label: 'заглавные буквы', test: (v) => /\p{Lu}/u.test(v) },
  { id: 'digit', label: 'цифры', test: (v) => /\p{N}/u.test(v) },
  { id: 'special', label: 'спецсимволы', test: (v) => /[^\p{L}\p{N}]/u.test(v) },
]

/** Password rule set (default: length, cases, digits, special characters). */
export function passwordRules(custom?: PasswordRule[]): PasswordRule[] {
  return custom && custom.length ? custom : DEFAULT_RULES
}

/** Validate a password against a rule set. */
export function validatePassword(value: string, rules: PasswordRule[]): boolean {
  return rules.every((r) => r.test(value))
}

/** Password check with a reactive list of satisfied rules. */
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

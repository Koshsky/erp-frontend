import { computed, type Ref } from 'vue'

/** A single password validation rule. Extended by adding a rule to passwordRules. */
export interface PasswordRule {
  id: string
  label: string
  /** Password check; true — rule satisfied */
  test: (value: string) => boolean
}

/** NIST-lean password rules: length 8..64 (code points, so emoji count once),
 *  at least one letter and one digit; all other characters are allowed
 *  (spaces, Cyrillic, emoji, repeats). No upper/lower/special requirements. */
const DEFAULT_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: 'от 8 до 64 символов',
    test: (v) => {
      const n = [...v].length
      return n >= 8 && n <= 64
    },
  },
  { id: 'letter', label: 'минимум одна буква', test: (v) => /\p{L}/u.test(v) },
  { id: 'digit', label: 'минимум одна цифра', test: (v) => /\p{N}/u.test(v) },
]

/** Password rule set (default: length 8-64, a letter and a digit). */
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

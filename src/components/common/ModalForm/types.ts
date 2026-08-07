export interface ModalFieldOption {
  value: number | string
  label: string
}

export interface ModalField {
  /** Ключ поля — имя в payload при сохранении (save(values)) */
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'date'
  /** Начальное значение (подставляется при открытии) */
  value?: number | string
  /** Варианты для type: 'select' */
  options?: ModalFieldOption[]
  required?: boolean
  placeholder?: string
}

export interface ModalFormProps {
  /** Видимость модалки */
  open: boolean
  /** Заголовок окна */
  title: string
  /** Описание полей формы; не нужно, если используется default-слот */
  fields?: ModalField[]
  /** Текст кнопки подтверждения; по умолчанию «Сохранить» */
  submitLabel?: string
  /** Идёт сохранение: кнопка заблокирована, показывается спиннер */
  busy?: boolean
  /** Текст ошибки внутри модалки */
  error?: string | null
}

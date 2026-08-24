import { AxiosError, type AxiosPromise, type InternalAxiosRequestConfig } from 'axios'

/**
 * Axios-адаптер fail-fast для офлайн-режима (Electron): не отправляет запрос
 * в сеть и не ждёт ответа/таймаута — сразу отклоняет синтетической сетевой
 * ошибкой с настоящим config (метод/URL/тело). Дальше ошибка проходит
 * существующие ветки response-интерцептора (src/http.ts): мутации мгновенно
 * уходят в очередь outbox, GET — отдаются из офлайн-кэша.
 *
 * Подмешивается ТОЛЬКО в apiConfig() (src/store/index.ts), которым пользуются
 * сгенерированные API-клиенты. Служебные запросы — отправка очереди
 * (flushOutbox через сырой axios) и health-проба (fetch) — этот адаптер не
 * видят и ходят в сеть как обычно: иначе при «висящем» флаге isOffline и уже
 * вернувшейся сети вся очеpедь падала бы с бессмысленными Network Error.
 */
export function offlineFailFastAdapter(config: InternalAxiosRequestConfig): AxiosPromise {
  return Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config))
}
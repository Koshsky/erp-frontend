const BASE = '/api/v1'

interface ApiResponse<T = any> {
  data?: T
  error?: string
}

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const body: ApiResponse = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  if (res.status === 204) return null

  return res.json()
}

export function getProjects() {
  return request('/projects')
}

export function getProject(id: string | number) {
  return request(`/projects/${id}`)
}

export function getProcessesByProject(projectId: string | number) {
  return request(`/projects/${projectId}/processes`)
}

export function getTasksByProcess(processId: string | number) {
  return request(`/processes/${processId}/tasks`)
}

export function getMilestonesByProcess(processId: string | number) {
  return request(`/processes/${processId}/milestones`)
}

export function getAllResources() {
  return request('/resources')
}

const API_BASE = '/api'

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('resa_token')
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `API error ${res.status}`)
  }
  return res.json()
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ token: string; user: { id: number; name: string; email: string; role: string } }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  localStorage.setItem('resa_token', data.token)
  localStorage.setItem('resa_user', JSON.stringify(data.user))
  return data.user
}

export function logout() {
  localStorage.removeItem('resa_token')
  localStorage.removeItem('resa_user')
}

export function getStoredUser() {
  const raw = localStorage.getItem('resa_user')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

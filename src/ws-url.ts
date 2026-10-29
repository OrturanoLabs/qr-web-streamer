const configuredUrl = import.meta.env.VITE_WS_URL?.trim();

export function getWebSocketUrl(): string {
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '').endsWith('/ws')
      ? configuredUrl.trim()
      : `${configuredUrl.replace(/\/+$/, '')}/ws`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

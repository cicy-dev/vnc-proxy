import { SystemEvent } from '../types';

const FAPI = 'https://g-fast-api.cicy.de5.net';

export const sendCommandToVnc = async (command: string, profileType?: string, tmuxTarget?: string, display?: string): Promise<{ success: boolean; message: string }> => {
  console.log('[sendCommand]', { profileType, tmuxTarget, command, display });
  
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  // ttyd 模式：tmux send-keys
  if (profileType === 'ttyd' && tmuxTarget) {
    console.log('[sendCommand] Using ttyd mode, sending to:', `${FAPI}/api/tmux/send`);
    const res = await fetch(`${FAPI}/api/tmux/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: command, target: tmuxTarget }),
    });
    const data = await res.json();
    console.log('[sendCommand] ttyd response:', data);
    return { success: data.success, message: data.success ? 'Sent to tmux' : data.error };
  }

  // VNC 模式：use local measure_window.py /api/type
  console.log('[sendCommand] Using VNC mode, sending to: /api/type with display:', display || ':1');
  const res = await fetch('/api/type', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: command, target: display || ':1' }),
  });
  console.log('[sendCommand] Response status:', res.status, res.statusText);
  if (!res.ok) {
    console.error('[sendCommand] Request failed with status:', res.status);
    return { success: false, message: `HTTP ${res.status}` };
  }
  const data = await res.json();
  console.log('[sendCommand] Response data:', data);
  return { success: !!data.success, message: data.success ? 'Typed to VNC' : (data.error || 'request failed') };
};

export const sendSystemEvent = async (event: SystemEvent, display?: string): Promise<void> => {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (event.type === 'keydown') {
    await fetch(`${FAPI}/api/vnc/key`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: event.code, target: display || ':1' }),
    }).catch(() => {});
  }
};

export const sendShortcut = async (key: string, display?: string): Promise<void> => {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  await fetch(`${FAPI}/api/vnc/key`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ key, target: display || ':1' }),
  }).catch(() => {});
};

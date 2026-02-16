import { SystemEvent } from '../types';

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
    const res = await fetch('/api/tmux', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: command, target: tmuxTarget }),
    });
    const data = await res.json();
    return { success: data.success, message: data.success ? 'Sent to tmux' : data.error };
  }

  // VNC 模式：xdotool type
  const res = await fetch('/api/type', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: command, display: display || ':1' }),
  });
  const data = await res.json();
  return { success: data.success, message: data.success ? 'Typed to VNC' : data.error };
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
    await fetch('/api/key', {
      method: 'POST',
      headers,
      body: JSON.stringify({ key: event.code, display: display || ':1' }),
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

  await fetch('/api/key', {
    method: 'POST',
    headers,
    body: JSON.stringify({ key, display: display || ':1' }),
  }).catch(() => {});
};

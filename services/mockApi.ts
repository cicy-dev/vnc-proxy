import { SystemEvent } from '../types';

export const sendCommandToVnc = async (command: string, profileType?: string, tmuxTarget?: string): Promise<{ success: boolean; message: string }> => {
  console.log('[sendCommand]', { profileType, tmuxTarget, command });
  
  // ttyd 模式：tmux send-keys
  if (profileType === 'ttyd' && tmuxTarget) {
    const res = await fetch('/api/tmux', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: command, target: tmuxTarget }),
    });
    const data = await res.json();
    return { success: data.success, message: data.success ? 'Sent to tmux' : data.error };
  }

  // VNC 模式：xdotool type
  const res = await fetch('/api/type', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: command }),
  });
  const data = await res.json();
  return { success: data.success, message: data.success ? 'Typed to VNC' : data.error };
};

export const sendSystemEvent = async (event: SystemEvent): Promise<void> => {
  // 按键转发到 VNC
  if (event.type === 'keydown') {
    await fetch('/api/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: event.code }),
    }).catch(() => {});
  }
};

// 发送组合键到 VNC（如 ctrl+c, ctrl+v）
export const sendShortcut = async (key: string): Promise<void> => {
  await fetch('/api/key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  }).catch(() => {});
};

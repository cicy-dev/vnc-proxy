import { SystemEvent } from '../types';

export const sendCommandToVnc = async (command: string): Promise<{ success: boolean; message: string }> => {
  // 打字到 VNC 聚焦区域
  const res = await fetch('/api/type', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: command }),
  });
  const data = await res.json();
  return {
    success: data.success,
    message: data.success ? 'Typed to VNC' : data.error,
  };
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

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface VncProfile {
  id: string;
  name: string;
  url: string;
  type?: 'vnc' | 'ttyd';       // 默认 vnc
  tmuxTarget?: string;           // ttyd 类型时，tmux send-keys 的目标，如 "master:cicy_master_xk_bot.0"
}

export interface AppSettings {
  panelPosition: Position;
  panelSize: Size;
  profiles: VncProfile[];
  activeProfileId: string | null;
  forwardEvents: boolean;
  lastDraft?: string;
  showPrompt: boolean;
  showVoiceControl: boolean;
  voiceButtonPosition: Position;
}

export interface SystemEvent {
  type: 'keydown' | 'keyup';
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface CommandLog {
  id: string;
  text: string;
  timestamp: Date;
  status: 'sending' | 'sent' | 'error';
}
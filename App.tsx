import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Settings, Wifi, WifiOff, X, Plus, Trash2, Edit2, Keyboard, Check, Mic, MicOff, Terminal, MessageSquare, Maximize } from 'lucide-react';
import { VncFrame } from './components/VncFrame';
import { FloatingPanel } from './components/FloatingPanel';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { sendCommandToVnc, sendSystemEvent, sendShortcut } from './services/mockApi';
import { AppSettings, VncProfile, Position, Size } from './types';

// Default configuration
const DEFAULT_PROFILE: VncProfile = {
  id: 'default',
  name: 'VNC :1',
  url: '/vnc/vnc.html?autoconnect=true&resize=scale&path=vnc/websockify',
  display: ':1'
};

const VNC2_PROFILE: VncProfile = {
  id: 'vnc2',
  name: 'VNC :2',
  url: 'https://g-6082.cicy.de5.net/vnc.html?autoconnect=true&resize=scale',
  display: ':2'
};

// TODO: remove all ttyd logic from vnc-proxy (ttyd has its own project: ttyd-proxy)
// ttyd profiles 从 /api/bots 动态加载
const DEFAULT_TTYD_PROFILES: VncProfile[] = [];

const DEFAULT_SETTINGS: AppSettings = {
  panelPosition: { x: 20, y: 20 },
  panelSize: { width: 450, height: 188 },
  profiles: [DEFAULT_PROFILE, VNC2_PROFILE],
  activeProfileId: 'default',
  forwardEvents: false,
  lastDraft: '',
  showPrompt: true,
  showVoiceControl: false,
  // Center Left Up roughly
  voiceButtonPosition: { x: 40, y: 200 }
};

const STORAGE_KEY = 'vnc_app_settings_v8';

// Speech Recognition Type Definition
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}

const App: React.FC = () => {
  // --- State Management ---
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // UI State
  const [isInteracting, setIsInteracting] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Voice State
  const [isListening, setIsListening] = useState(false);
  const voiceModeRef = useRef<'append' | 'direct'>('append');

  // Settings Form State
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [tempProfileName, setTempProfileName] = useState('');
  const [tempProfileUrl, setTempProfileUrl] = useState('');
  const [tempProfileType, setTempProfileType] = useState<'vnc' | 'ttyd'>('vnc');
  const [tempProfileTmux, setTempProfileTmux] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Initialization & Persistence ---
  
  useEffect(() => {
    const init = async () => {
      // 加载 localStorage
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // 强制使用最新的默认 profiles
          parsed.profiles = [DEFAULT_PROFILE, VNC2_PROFILE];
          if (!parsed.activeProfileId || !parsed.profiles.find((p: any) => p.id === parsed.activeProfileId)) {
            parsed.activeProfileId = 'default';
          }
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
          if (parsed.lastDraft) setPromptText(parsed.lastDraft);
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }
      setIsLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings, isLoaded]);

  // Auto-save draft
  useEffect(() => {
    if (!isLoaded) return;
    const timeoutId = setTimeout(() => {
        setSettings(prev => {
            if (prev.lastDraft === promptText) return prev;
            return { ...prev, lastDraft: promptText };
        });
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [promptText, isLoaded]);

  // --- Derived State (must be before hooks that use it) ---
  const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];

  // --- Voice Input Logic (Server-side STT) ---

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleVoiceResult = useCallback(async (text: string) => {
    if (voiceModeRef.current === 'append') {
        setPromptText(prev => {
            const prefix = prev.trim() ? prev.trim() + ' ' : '';
            return prefix + text;
        });
    } else if (voiceModeRef.current === 'direct') {
        if (text.trim()) {
            setIsSending(true);
            try {
                await sendCommandToVnc(text, activeProfile?.type, activeProfile?.tmuxTarget, activeProfile?.display);
            } catch (error) {
                console.error("Voice command failed", error);
            } finally {
                setIsSending(false);
            }
        }
    }
  }, []);

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 1000) return; // 太短忽略
        setIsListening(false);
        try {
          const res = await fetch('/api/voice', { method: 'POST', body: blob });
          const data = await res.json();
          if (data.text) handleVoiceResult(data.text);
        } catch (e) {
          console.error('Voice upload failed', e);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch (e) {
      console.error('Mic access failed', e);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };


  // --- Event Forwarding ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!settings.forwardEvents) return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // 拦截 Ctrl/Cmd + C/V/A/Z，转发到 VNC
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['c', 'v', 'a', 'z'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
      sendShortcut(`ctrl+${e.key.toLowerCase()}`, activeProfile?.display);
      return;
    }

    // 其他按键也转发
    sendSystemEvent({
      type: 'keydown',
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey
    }, activeProfile?.display);
  }, [settings.forwardEvents, activeProfile?.display]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // --- Actions ---

  const handleSendPrompt = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptText.trim()) return;

    const command = promptText;
    setPromptText(''); 
    setIsSending(true);

    try {
      await sendCommandToVnc(command, activeProfile?.type, activeProfile?.tmuxTarget, activeProfile?.display);
    } catch (error) {
      console.error("Failed to send command", error);
    } finally {
      setIsSending(false);
      // 发送后自动聚焦回输入框
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handlePanelChange = (pos: Position, size: Size) => {
    setSettings(prev => ({
      ...prev,
      panelPosition: pos,
      panelSize: size
    }));
  };

  const handleVoiceButtonPosChange = (pos: Position) => {
    setSettings(prev => ({ ...prev, voiceButtonPosition: pos }));
  };

  const toggleEventForwarding = () => {
    setSettings(prev => ({ ...prev, forwardEvents: !prev.forwardEvents }));
  };

  const toggleVoiceMode = () => {
      setSettings(prev => {
          const newVoiceState = !prev.showVoiceControl;
          return {
              ...prev,
              showVoiceControl: newVoiceState,
              showPrompt: !newVoiceState // Close prompt when voice opens, and vice versa if desired
          };
      });
  };

  // --- Settings Logic ---

  const closeSettings = () => {
    setShowSettings(false);
    setEditingProfileId(null);
  };

  const handleCreateProfile = () => {
    const newId = Date.now().toString();
    const newProfile: VncProfile = {
      id: newId,
      name: 'New Connection',
      url: ''
    };
    setSettings(prev => ({
      ...prev,
      profiles: [...prev.profiles, newProfile]
    }));
    startEditing(newProfile);
  };

  const startEditing = (profile: VncProfile) => {
    setEditingProfileId(profile.id);
    setTempProfileName(profile.name);
    setTempProfileUrl(profile.url);
    setTempProfileType(profile.type || 'vnc');
    setTempProfileTmux(profile.tmuxTarget || '');
  };

  const handleSaveProfile = () => {
    if (!editingProfileId) return;
    setSettings(prev => ({
      ...prev,
      profiles: prev.profiles.map(p => 
        p.id === editingProfileId 
          ? { ...p, name: tempProfileName, url: tempProfileUrl, type: tempProfileType, tmuxTarget: tempProfileTmux } 
          : p
      )
    }));
    setEditingProfileId(null);
  };

  const handleDeleteProfile = (id: string) => {
    if (settings.profiles.length <= 1) {
      alert("You must have at least one profile.");
      return;
    }
    let nextActiveId = settings.activeProfileId;
    if (id === settings.activeProfileId) {
       const other = settings.profiles.find(p => p.id !== id);
       nextActiveId = other ? other.id : null;
    }
    setSettings(prev => ({
      ...prev,
      profiles: prev.profiles.filter(p => p.id !== id),
      activeProfileId: nextActiveId
    }));
    if (editingProfileId === id) setEditingProfileId(null);
  };

  const handleSelectProfile = (id: string) => {
    setSettings(prev => ({ ...prev, activeProfileId: id }));
  };

  // Profile selector dropdown
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  if (!isLoaded) return <div className="bg-black w-screen h-screen"></div>;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      {/* Full Screen Iframes - display:none 隐藏非活跃的 */}
      <VncFrame 
        profiles={settings.profiles}
        activeProfileId={settings.activeProfileId}
        isInteractingWithOverlay={isInteracting} 
      />

      {/* Minimized Toggle Button (Visible when prompt is hidden) */}
      {!settings.showPrompt && (
        <div className="absolute top-4 right-4 z-40 flex gap-2">
           {/* Voice Button Toggle (Minimized) */}
           <button
                onClick={toggleVoiceMode}
                className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all ${
                    settings.showVoiceControl ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
            >
                <Mic size={18} />
                <span className="font-medium hidden md:inline">Voice</span>
           </button>

           <button
                onClick={() => setSettings(prev => ({ ...prev, showPrompt: true, showVoiceControl: false }))}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg transition-all"
            >
                <Terminal size={18} />
                <span className="font-medium">Prompt</span>
            </button>
        </div>
      )}

      {/* Floating Prompt Controller with Integrated Top Bar */}
      {settings.showPrompt && (
          <FloatingPanel
            title=""
            titleElement={
              <select
                value={settings.activeProfileId || ''}
                onChange={(e) => handleSelectProfile(e.target.value)}
                className="bg-transparent text-white text-sm font-medium outline-none cursor-pointer max-w-[160px] truncate"
              >
                {settings.profiles.map(p => (
                  <option key={p.id} value={p.id} className="bg-gray-900 text-white">
                    {p.name} {p.type === 'ttyd' ? '🖥' : '🖵'}
                  </option>
                ))}
              </select>
            }
            initialPosition={settings.panelPosition}
            initialSize={settings.panelSize}
            minSize={{ width: 340, height: 180 }}
            onInteractionStart={() => setIsInteracting(true)}
            onInteractionEnd={() => setIsInteracting(false)}
            onChange={handlePanelChange}
            onClose={() => setSettings(prev => ({ ...prev, showPrompt: false }))}
            headerActions={
                <>
                    {/* Toggle Voice Control (Minimizes Prompt) */}
                    <button
                        onClick={toggleVoiceMode}
                        className={`p-2 rounded-lg transition-all ${
                            settings.showVoiceControl
                                ? 'bg-red-600 text-white'
                                : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                        title="Switch to Voice Mode"
                    >
                        <Mic size={18} />
                    </button>

                    {/* Event Forwarding Toggle */}
                    <button 
                        onClick={toggleEventForwarding}
                        className={`p-2 rounded-lg transition-all flex items-center gap-2 ${
                            settings.forwardEvents 
                            ? 'bg-green-600 text-white' 
                            : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                        title={settings.forwardEvents ? "Event Forwarding Active" : "Enable Event Forwarding"}
                    >
                        <Keyboard size={18} />
                    </button>

                    {/* Settings Button */}
                    <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                        title="Connection Settings"
                    >
                        <Settings size={18} />
                    </button>
                </>
            }
          >
            <form onSubmit={handleSendPrompt} className="relative h-full flex flex-col p-4">
              <textarea
                ref={textareaRef}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSendPrompt();
                  }
                }}
                placeholder="Type a command to send to VNC..."
                className="flex-1 w-full bg-black/50 text-white rounded-lg border border-gray-700 p-3 pr-16 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-base shadow-inner"
                disabled={isSending}
              />
              
              <div className="absolute bottom-6 right-6 flex gap-2">
                {/* Send Button */}
                <button
                    type="submit"
                    disabled={!promptText.trim() || isSending}
                    className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                    <Send size={16} />
                </button>
              </div>
            </form>
          </FloatingPanel>
      )}

      {/* Floating Voice Control Button */}
      {settings.showVoiceControl && (
          <VoiceFloatingButton
            initialPosition={settings.voiceButtonPosition}
            onPositionChange={handleVoiceButtonPosChange}
            onRecordStart={() => startVoiceRecording('direct')}
            onRecordEnd={(shouldSend) => {
                stopVoiceRecording();
            }}
            isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
          />
      )}

      {/* Settings Modal - Reusing previous robust implementation */}
      {showSettings && (
        <div 
          className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 md:p-4"
          onClick={closeSettings}
        >
          <div 
            className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] md:h-[600px] flex flex-col md:flex-row overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sidebar List */}
            <div className={`w-full md:w-1/3 bg-gray-950/50 border-r border-gray-800 flex flex-col ${editingProfileId && window.innerWidth < 768 ? 'hidden' : 'flex'}`}>
              <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h2 className="font-bold text-gray-200">Profiles</h2>
                <button onClick={handleCreateProfile} className="p-2 hover:bg-gray-800 rounded text-blue-400">
                  <Plus size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {settings.profiles.map(profile => (
                  <div 
                    key={profile.id}
                    onClick={() => {
                        handleSelectProfile(profile.id);
                        if(window.innerWidth < 768) closeSettings();
                    }}
                    className={`p-3 rounded-md cursor-pointer flex items-center justify-between group transition-colors ${
                      settings.activeProfileId === profile.id 
                        ? 'bg-blue-900/20 border border-blue-800/50' 
                        : 'hover:bg-gray-800 border border-transparent'
                    }`}
                  >
                    <div className="flex flex-col truncate">
                      <span className={`text-sm font-medium truncate ${settings.activeProfileId === profile.id ? 'text-blue-400' : 'text-gray-300'}`}>
                        {profile.name}
                      </span>
                      <span className="text-xs text-gray-600 truncate">{profile.url || 'No URL'}</span>
                    </div>
                    <div className="flex gap-2">
                       <button 
                        onClick={(e) => { e.stopPropagation(); startEditing(profile); }}
                        className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleSelectProfile(profile.id); }}
                        className={`p-2 hover:bg-gray-700 rounded ${settings.activeProfileId === profile.id ? 'text-green-500' : 'text-gray-400 hidden md:block'}`}
                        title="Set Active"
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content Area */}
            <div className={`flex-1 flex flex-col bg-gray-900 ${!editingProfileId && window.innerWidth < 768 ? 'hidden' : 'flex'}`}>
              <div className="flex justify-between items-center p-4 border-b border-gray-800">
                <h2 className="text-xl font-bold text-white">
                  {editingProfileId ? 'Edit Profile' : 'Settings'}
                </h2>
                <button onClick={() => {
                    if (editingProfileId && window.innerWidth < 768) {
                        setEditingProfileId(null);
                    } else {
                        closeSettings();
                    }
                }} className="text-gray-400 hover:text-white p-2">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 p-4 md:p-6 overflow-y-auto">
                {editingProfileId ? (
                  <div className="space-y-6 max-w-lg mx-auto mt-4 md:mt-8">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Profile Name</label>
                      <input
                        type="text"
                        value={tempProfileName}
                        onChange={(e) => setTempProfileName(e.target.value)}
                        className="w-full bg-black border border-gray-700 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="My VNC Server"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">URL</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={tempProfileUrl}
                          onChange={(e) => setTempProfileUrl(e.target.value)}
                          className="w-full bg-black border border-gray-700 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none pl-10"
                          placeholder="https://..."
                        />
                        <div className="absolute left-3 top-3.5 text-gray-500">
                          {tempProfileUrl ? <Wifi size={16} /> : <WifiOff size={16} />}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Type</label>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => setTempProfileType('vnc')}
                          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${tempProfileType === 'vnc' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          VNC
                        </button>
                        <button type="button" onClick={() => setTempProfileType('ttyd')}
                          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${tempProfileType === 'ttyd' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                          TTYD
                        </button>
                      </div>
                    </div>
                    {tempProfileType === 'ttyd' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Tmux Target</label>
                        <input
                          type="text"
                          value={tempProfileTmux}
                          onChange={(e) => setTempProfileTmux(e.target.value)}
                          className="w-full bg-black border border-gray-700 rounded px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="master:cicy_master_xk_bot.0"
                        />
                      </div>
                    )}
                    
                    <div className="pt-4 flex flex-col-reverse md:flex-row items-center justify-between border-t border-gray-800 mt-8 gap-4">
                      <button 
                         onClick={() => handleDeleteProfile(editingProfileId)}
                         className="flex items-center gap-2 text-red-500 hover:text-red-400 text-sm px-3 py-2 hover:bg-red-900/20 rounded w-full md:w-auto justify-center"
                      >
                        <Trash2 size={16} /> Delete Profile
                      </button>
                      <div className="flex gap-3 w-full md:w-auto">
                        <button
                          onClick={() => setEditingProfileId(null)}
                          className="flex-1 md:flex-none px-4 py-3 md:py-2 text-sm text-gray-300 hover:text-white bg-gray-800 md:bg-transparent rounded md:rounded-none"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveProfile}
                          className="flex-1 md:flex-none px-4 py-3 md:py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded font-medium"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Settings size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-400 text-center">Select a profile to edit</p>
                    <div className="mt-8 p-4 bg-gray-800/30 rounded-lg max-w-sm w-full border border-gray-800">
                        <h3 className="text-gray-300 font-medium mb-2">Current Active Configuration</h3>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-500">Name:</span>
                            <span className="text-white">{activeProfile.name}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm mt-1">
                            <span className="text-gray-500">URL:</span>
                            <span className="text-blue-400 truncate max-w-[150px]">{activeProfile.url || 'None'}</span>
                        </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
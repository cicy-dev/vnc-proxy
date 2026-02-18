import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Send, Settings, Wifi, WifiOff, X, Plus, Trash2, Edit2, Keyboard, Check, Mic, MicOff, Terminal, MessageSquare, Maximize, Loader2, CheckCircle, History, Menu, Sparkles } from 'lucide-react';
import { DraggableVncFrame } from './components/DraggableVncFrame';
import { FloatingPanel } from './components/FloatingPanel';
import { VoiceFloatingButton } from './components/VoiceFloatingButton';
import { LoginForm } from './components/LoginForm';
import { sendCommandToVnc, sendSystemEvent, sendShortcut } from './services/mockApi';
import { AppSettings, VncProfile, Position, Size } from './types';

// Default configuration
const DEFAULT_PROFILE: VncProfile = {
  id: 'default',
  name: 'VNC :1',
  url: 'https://g-6080.cicy.de5.net/vnc.html?autoconnect=true',
  display: ':1'
};

const VNC2_PROFILE: VncProfile = {
  id: 'vnc2',
  name: 'VNC :2',
  url: 'https://g-6082.cicy.de5.net/vnc.html?autoconnect=true',
  display: ':2'
};

// TODO: remove all ttyd logic from vnc-proxy (ttyd has its own project: ttyd-proxy)
// ttyd profiles 从 /api/bots 动态加载
const DEFAULT_TTYD_PROFILES: VncProfile[] = [];

const DEFAULT_SETTINGS: AppSettings = {
  panelPosition: { x: 20, y: 20 },
  panelSize: { width: 450, height: 120 },
  profiles: [DEFAULT_PROFILE, VNC2_PROFILE],
  activeProfileId: 'default',
  forwardEvents: false,
  lastDraft: '',
  showPrompt: true,
  showVoiceControl: false,
  // Center Left Up roughly
  voiceButtonPosition: { x: 40, y: 200 },
  commandHistory: []
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
  const [token, setToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // UI State
  const [isInteracting, setIsInteracting] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [correctedText, setCorrectedText] = useState('');
  const [isCorrectingEnglish, setIsCorrectingEnglish] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // Network Status
  const [networkLatency, setNetworkLatency] = useState<number | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'excellent' | 'good' | 'poor' | 'offline'>('good');
  
  // Command History
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tempDraft, setTempDraft] = useState(''); // Store current input when navigating history
  
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
      // Check for token first
      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        // Verify token is still valid
        try {
          const res = await fetch('/api/type', {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${savedToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: '', display: ':1' })
          });
          if (res.ok || res.status === 200) {
            setToken(savedToken);
          } else {
            localStorage.removeItem('token');
          }
        } catch (e) {
          console.error('Token verification failed', e);
          localStorage.removeItem('token');
        }
      }
      setIsCheckingAuth(false);

      // Load settings
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          parsed.profiles = [DEFAULT_PROFILE, VNC2_PROFILE];
          if (!parsed.activeProfileId || !parsed.profiles.find((p: any) => p.id === parsed.activeProfileId)) {
            parsed.activeProfileId = 'default';
          }
          if (!parsed.commandHistory) {
            parsed.commandHistory = [];
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

  // Network Health Check
  useEffect(() => {
    const checkHealth = async () => {
      const startTime = performance.now();
      try {
        const response = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-cache'
        });
        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);
        
        if (response.ok) {
          setNetworkLatency(latency);
          // Determine status based on latency
          if (latency < 100) {
            setNetworkStatus('excellent');
          } else if (latency < 300) {
            setNetworkStatus('good');
          } else {
            setNetworkStatus('poor');
          }
        } else {
          setNetworkStatus('offline');
          setNetworkLatency(null);
        }
      } catch (error) {
        setNetworkStatus('offline');
        setNetworkLatency(null);
      }
    };

    // Check immediately
    checkHealth();
    
    // Check every 5 seconds
    const interval = setInterval(checkHealth, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
  };

  // --- Derived State (must be before hooks that use it) ---
  const activeProfile = settings.profiles.find(p => p.id === settings.activeProfileId) || settings.profiles[0];

  // --- Voice Input Logic (Client-side STT using Web Speech API) ---

  const recognitionRef = useRef<any>(null);
  const interimTranscriptRef = useRef<string>('');

  const handleVoiceResult = useCallback(async (text: string) => {
    if (voiceModeRef.current === 'append') {
        setPromptText(prev => {
            const prefix = prev.trim() ? prev.trim() + ' ' : '';
            return prefix + text;
        });
    } else if (voiceModeRef.current === 'direct') {
        if (text.trim()) {
            setIsSending(true);
            setSendSuccess(false);
            try {
                // Send text directly to VNC/tmux
                await sendCommandToVnc(text, activeProfile?.type, activeProfile?.tmuxTarget, activeProfile?.display);
                setSendSuccess(true);
                setTimeout(() => setSendSuccess(false), 2000);
            } catch (error) {
                console.error("Voice command failed", error);
            } finally {
                setIsSending(false);
            }
        }
    }
  }, [activeProfile]);

  // --- English Correction Logic ---
  const handleCorrectEnglish = async () => {
    if (!promptText.trim() || isCorrectingEnglish) return;
    
    setIsCorrectingEnglish(true);
    setCorrectedText('');
    
    try {
      const response = await fetch('/api/correctEnglish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ text: promptText })
      });
      
      const data = await response.json();
      
      if (data.success && data.correctedText) {
        setCorrectedText(data.correctedText);
      } else {
        console.error('English correction failed:', data.error);
        alert('Failed to correct English: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('English correction error:', error);
      alert('Failed to correct English. Please check your connection.');
    } finally {
      setIsCorrectingEnglish(false);
    }
  };

  const handleAcceptCorrection = () => {
    if (correctedText) {
      setPromptText(correctedText);
      setCorrectedText('');
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleDismissCorrection = () => {
    setCorrectedText('');
  };

  const startVoiceRecording = async (mode: 'append' | 'direct') => {
    voiceModeRef.current = mode;
    
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN'; // 中文简体

      recognition.onstart = () => {
        setIsListening(true);
        interimTranscriptRef.current = '';
        console.log('Voice recognition started');
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Store interim results for display (optional)
        interimTranscriptRef.current = interimTranscript;

        // Process final results
        if (finalTranscript) {
          handleVoiceResult(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        console.log('Voice recognition ended');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
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

  const handleSelectHistory = (command: string) => {
    setPromptText(command);
    setShowHistory(false);
    setHistoryIndex(-1);
    setTempDraft(command);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteHistory = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setSettings(prev => ({
      ...prev,
      commandHistory: prev.commandHistory.filter((_, idx) => idx !== index)
    }));
  };

  const handleClearAllHistory = () => {
    setSettings(prev => ({
      ...prev,
      commandHistory: []
    }));
  };

  const handleSendPrompt = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptText.trim()) return;

    const command = promptText;
    
    // Add to history in settings
    setSettings(prev => {
      const currentHistory = prev.commandHistory || [];
      const newHistory = [command, ...currentHistory.filter(cmd => cmd !== command)].slice(0, 50);
      return { ...prev, commandHistory: newHistory };
    });
    setHistoryIndex(-1);
    setTempDraft('');
    
    setPromptText(''); 
    setIsSending(true);
    setSendSuccess(false);

    try {
      await sendCommandToVnc(command, activeProfile?.type, activeProfile?.tmuxTarget, activeProfile?.display);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 2000);
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

  // Show loading screen while checking auth
  if (isCheckingAuth) {
    return <div className="bg-black w-screen h-screen flex items-center justify-center">
      <Loader2 size={48} className="text-blue-500 animate-spin" />
    </div>;
  }

  // Show login form if not authenticated
  if (!token) {
    return <LoginForm onLogin={handleLogin} />;
  }

  if (!isLoaded) return <div className="bg-black w-screen h-screen"></div>;

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden font-sans">
      {/* Full Screen Iframes - display:none 隐藏非活跃的 */}
      <div 
        className="absolute inset-0 transition-all duration-300"
        style={{ 
          right: showSidebar ? '320px' : '0'
        }}
      >
        <DraggableVncFrame 
          profiles={settings.profiles}
          activeProfileId={settings.activeProfileId}
          isInteractingWithOverlay={isInteracting} 
        />
      </div>

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
                    {p.name}
                  </option>
                ))}
              </select>
            }
            initialPosition={settings.panelPosition}
            initialSize={settings.panelSize}
            minSize={{ width: 340, height: 120 }}
            onInteractionStart={() => setIsInteracting(true)}
            onInteractionEnd={() => setIsInteracting(false)}
            onChange={handlePanelChange}
            onClose={() => setSettings(prev => ({ ...prev, showPrompt: false }))}
            headerActions={
                <>
                    {/* Network Status Indicator */}
                    <div 
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-800/50"
                        title={networkLatency !== null ? `Latency: ${networkLatency}ms` : 'Offline'}
                    >
                        {networkStatus === 'excellent' && (
                            <Wifi size={16} className="text-green-400" />
                        )}
                        {networkStatus === 'good' && (
                            <Wifi size={16} className="text-yellow-400" />
                        )}
                        {networkStatus === 'poor' && (
                            <Wifi size={16} className="text-orange-400" />
                        )}
                        {networkStatus === 'offline' && (
                            <WifiOff size={16} className="text-red-400" />
                        )}
                        <span className="text-xs text-gray-400 font-mono">
                            {networkLatency !== null ? `${networkLatency}ms` : 'offline'}
                        </span>
                    </div>

                    {/* Voice Record Toggle - just highlight */}
                    <button
                        onClick={() => setSettings(prev => ({ ...prev, showVoiceControl: !prev.showVoiceControl }))}
                        className={`p-1.5 rounded-lg transition-colors ${
                            settings.showVoiceControl 
                            ? 'bg-red-600 text-white' 
                            : 'text-gray-400 hover:bg-gray-700 hover:text-white'
                        }`}
                        title={settings.showVoiceControl ? "Voice Active" : "Enable Voice"}
                    >
                        <Mic size={16} />
                    </button>

                    {/* Correct English Button */}
                    <button
                        onClick={handleCorrectEnglish}
                        disabled={!promptText.trim() || isCorrectingEnglish}
                        className="p-1.5 rounded-lg text-purple-400 hover:bg-purple-600/20 transition-colors disabled:opacity-50"
                        title="Correct English with AI"
                    >
                        {isCorrectingEnglish ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Sparkles size={16} />
                        )}
                    </button>
                </>
            }
          >
            <form onSubmit={handleSendPrompt} className="relative h-full w-full flex flex-col p-3">
              <div className="flex-1 flex flex-col min-h-0">
                {/* Textarea wrapper with relative positioning */}
                <div className="relative h-full">
                  <textarea
                    ref={textareaRef}
                    value={promptText}
                    onChange={(e) => {
                      setPromptText(e.target.value);
                      if (historyIndex === -1) {
                        setTempDraft(e.target.value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleSendPrompt();
                      }
                      else if (e.key === 'ArrowUp') {
                        const textarea = e.currentTarget;
                        const cursorPos = textarea.selectionStart;
                        const textBeforeCursor = textarea.value.substring(0, cursorPos);
                        const isOnFirstLine = !textBeforeCursor.includes('\n');
                        
                        if (isOnFirstLine) {
                          e.preventDefault();
                          const history = settings.commandHistory || [];
                          if (history.length > 0) {
                            if (historyIndex === -1) {
                              setTempDraft(promptText);
                              setHistoryIndex(0);
                              setPromptText(history[0]);
                            } else if (historyIndex < history.length - 1) {
                              const newIndex = historyIndex + 1;
                              setHistoryIndex(newIndex);
                              setPromptText(history[newIndex]);
                            }
                          }
                        }
                      }
                      else if (e.key === 'ArrowDown') {
                        const textarea = e.currentTarget;
                        const cursorPos = textarea.selectionStart;
                        const textAfterCursor = textarea.value.substring(cursorPos);
                        const isOnLastLine = !textAfterCursor.includes('\n');
                        
                        if (isOnLastLine) {
                          e.preventDefault();
                          if (historyIndex > 0) {
                            const newIndex = historyIndex - 1;
                            setHistoryIndex(newIndex);
                            setPromptText(settings.commandHistory[newIndex]);
                          } else if (historyIndex === 0) {
                            setHistoryIndex(-1);
                            setPromptText(tempDraft);
                          }
                        }
                      }
                    }}
                    rows={2}
                    placeholder="Type command..."
                    className="w-full h-full bg-black/50 text-white rounded-lg border border-gray-700 p-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm shadow-inner placeholder:text-gray-600 placeholder:opacity-50"
                    disabled={isSending}
                  />
                  
                  {/* Send button */}
                  <div className="absolute bottom-2 right-2">
                    <button
                        type="submit"
                        disabled={!promptText.trim() || isSending}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isSending ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : sendSuccess ? (
                            <CheckCircle size={14} className="text-green-400" />
                        ) : (
                            <Send size={14} />
                        )}
                    </button>
                  </div>
                </div>

                {/* Corrected Text Display */}
                {correctedText && (
                  <div className="mt-2 p-3 bg-purple-900/30 border border-purple-700 rounded-lg">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-purple-400 flex-shrink-0" />
                        <span className="text-xs text-purple-300 font-medium">Corrected Text:</span>
                      </div>
                      <button
                        onClick={handleDismissCorrection}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <p className="text-sm text-white mb-3 whitespace-pre-wrap">{correctedText}</p>
                    <button
                      onClick={handleAcceptCorrection}
                      className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      <Check size={14} />
                      Use This Text
                    </button>
                  </div>
                )}

                {/* History List View */}
                {showHistory && (
                  <div className="mt-2 flex-1 overflow-y-auto bg-black/30 rounded-lg border border-gray-700 flex flex-col">
                    {settings.commandHistory && settings.commandHistory.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-900/50">
                          <span className="text-xs text-gray-400">Command History</span>
                          <button
                            onClick={handleClearAllHistory}
                            className="text-xs text-red-400 hover:text-red-300 transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                        <div className="divide-y divide-gray-800 overflow-y-auto">
                          {settings.commandHistory.map((cmd, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleSelectHistory(cmd)}
                              className="px-3 py-2 hover:bg-gray-800 cursor-pointer text-gray-300 hover:text-white transition-colors group"
                            >
                              <div className="flex items-center gap-2">
                                <History size={12} className="text-gray-500 flex-shrink-0" />
                                <span className="truncate text-sm flex-1">{cmd}</span>
                                <button
                                  onClick={(e) => handleDeleteHistory(e, idx)}
                                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="px-4 py-3 text-gray-500 text-center text-sm">
                        No command history yet
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
          </FloatingPanel>
      )}

      {/* Floating Voice Control Button - show/hide based on toggle */}
      {settings.showVoiceControl && (
        <VoiceFloatingButton
          initialPosition={settings.voiceButtonPosition}
          onPositionChange={handleVoiceButtonPosChange}
          onRecordStart={() => startVoiceRecording('direct')}
          onRecordEnd={(shouldSend) => {
              stopVoiceRecording();
          }}
          isRecordingExternal={isListening && voiceModeRef.current === 'direct'}
          isSending={isSending}
          sendSuccess={sendSuccess}
        />
      )}

      {/* Sidebar Menu */}
      {showSidebar && (
        <div className="fixed right-0 top-0 h-full w-80 bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col z-[90]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-800">
            <h2 className="text-lg font-bold text-white">VNC Profiles</h2>
            <button 
              onClick={() => setShowSidebar(false)}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* VNC List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {settings.profiles.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => {
                    handleSelectProfile(profile.id);
                  }}
                  className={`w-full text-left p-4 rounded-lg transition-all ${
                    settings.activeProfileId === profile.id
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{profile.name}</div>
                      <div className="text-xs opacity-70 mt-1 truncate">
                        {profile.type === 'ttyd' ? '🖥️ Terminal' : '🖵 VNC'} • {profile.display || 'N/A'}
                      </div>
                    </div>
                    {settings.activeProfileId === profile.id && (
                      <Check size={20} className="flex-shrink-0 ml-2" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={() => {
                setShowSettings(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Settings size={18} />
              <span>Manage Profiles</span>
            </button>
          </div>
        </div>
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
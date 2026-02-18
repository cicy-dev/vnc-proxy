import React, { useState, useRef, useEffect } from 'react';
import { GripHorizontal } from 'lucide-react';
import { Position, Size, VncProfile } from '../types';

interface DraggableVncFrameProps {
  profiles: VncProfile[];
  activeProfileId: string | null;
  isInteractingWithOverlay: boolean;
  initialPosition?: Position;
  onSelectProfile?: (profileId: string) => void;
  topProfileId?: string | null;
  visible?: boolean;
}

const DEFAULT_SIZE: Size = { width: 1200, height: 800 };

const RESOLUTIONS = [
  { label: '800x600', width: 800, height: 600 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '1280x720', width: 1280, height: 720 },
  { label: '1920x1080', width: 1920, height: 1080 },
];

export const DraggableVncFrame: React.FC<DraggableVncFrameProps> = ({
  profiles,
  activeProfileId,
  isInteractingWithOverlay,
  initialPosition = { x: 20, y: 20 },
  onSelectProfile,
  topProfileId,
  visible = true,
}) => {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [isDragging, setIsDragging] = useState(false);
  const [panOffset, setPanOffset] = useState<Position>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const isOnTop = topProfileId ? topProfileId === activeProfileId : true;

  const windowRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number; posX: number; posY: number }>({ x: 0, y: 0, posX: 20, posY: 20 });
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });

  const getClientPos = (e: MouseEvent | TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if ('clientX' in e) {
      return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
    }
    return { x: 0, y: 0 };
  };

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('select')) return;
    if (e.cancelable) e.preventDefault();
    (e as any).stopPropagation();
    
    const clientPos = getClientPos(e as any);
    setIsDragging(true);
    dragStart.current = { x: clientPos.x, y: clientPos.y, posX: position.x, posY: position.y };
  };

  const handlePanStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    (e as any).stopPropagation();
    
    const clientPos = getClientPos(e as any);
    setIsPanning(true);
    panStart.current = { x: clientPos.x, y: clientPos.y, panX: panOffset.x, panY: panOffset.y };
  };

  const handleResize = (width: number, height: number) => {
    setSize({ width, height });
  };

  useEffect(() => {
    const handleMove = (e: any) => {
      const clientPos = getClientPos(e);

      if (isDragging) {
        if (e.cancelable) e.preventDefault();
        const dx = clientPos.x - dragStart.current.x;
        const dy = clientPos.y - dragStart.current.y;
        setPosition({ x: dragStart.current.posX + dx, y: dragStart.current.posY + dy });
      }

      if (isPanning) {
        if (e.cancelable) e.preventDefault();
        const dx = clientPos.x - panStart.current.x;
        const dy = clientPos.y - panStart.current.y;
        setPanOffset({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      setIsPanning(false);
    };

    if (isDragging || isPanning) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, isPanning, position, panOffset]);

  const getProfilesWithPassword = () => {
    const vncPassword = localStorage.getItem('vnc_password');
    if (!vncPassword) return profiles;
    return profiles.map(profile => {
      if (!profile.url || profile.url.includes('password=')) return profile;
      const separator = profile.url.includes('?') ? '&' : '?';
      return { ...profile, url: `${profile.url}${separator}password=${encodeURIComponent(vncPassword)}` };
    });
  };

  const profilesWithPassword = getProfilesWithPassword();
  const activeProfile = profilesWithPassword.find(p => p.id === activeProfileId);

  return (
    <div
      ref={windowRef}
      className="absolute flex flex-col bg-black border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
      onClick={() => {
        if (activeProfile) {
          onSelectProfile?.(activeProfile.id);
        }
      }}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: isOnTop ? 95 : 1,
        display: visible ? 'flex' : 'none',
      }}
      >
        <div
          className="h-10 bg-gray-800 border-b border-gray-700 flex items-center px-3 cursor-grab shrink-0"
          onMouseDown={handleDragStart}
          onTouchStart={handleDragStart}
        >
          <div className="flex items-center gap-2 text-gray-300 min-w-0 flex-1">
            <GripHorizontal size={18} className="shrink-0" />
            <span className="text-sm font-medium truncate">{activeProfile?.name || 'VNC'}</span>
            
            <select
              onChange={(e) => {
                e.stopPropagation();
                const [w, h] = e.target.value.split('x').map(Number);
                handleResize(w, h);
              }}
              onClick={(e) => e.stopPropagation()}
              value={`${size.width}x${size.height}`}
              className="bg-gray-700 text-white text-xs px-2 py-0.5 rounded cursor-pointer ml-2"
            >
              {RESOLUTIONS.map((res) => (
                <option key={res.label} value={`${res.width}x${res.height}`}>
                  {res.label}
                </option>
              ))}
            </select>
          </div>
        </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        {isPanning && (
          <div className="absolute inset-0 z-10 cursor-grabbing bg-black/30" />
        )}
        {activeProfile?.url ? (
          <iframe
            src={activeProfile.url}
            title={activeProfile.name}
            className={`w-full h-full border-none absolute inset-0 ${
              isInteractingWithOverlay || isPanning || isDragging ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
              transformOrigin: 'center center',
              opacity: isDragging ? 0.7 : 1,
              cursor: isPanning ? 'grabbing' : 'default',
            }}
            onMouseDown={handlePanStart}
            onTouchStart={handlePanStart}
            allowFullScreen
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <p>No URL configured</p>
          </div>
        )}
      </div>
    </div>
  );
};

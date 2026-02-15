import React from 'react';
import { VncProfile } from '../types';

interface VncFrameProps {
  profiles: VncProfile[];
  activeProfileId: string | null;
  isInteractingWithOverlay: boolean;
}

export const VncFrame: React.FC<VncFrameProps> = ({ profiles, activeProfileId, isInteractingWithOverlay }) => {
  return (
    <div className="absolute inset-0 z-0 bg-black overflow-hidden">
      {profiles.filter(p => p.url).map(profile => (
        <iframe
          key={profile.id}
          src={profile.url}
          title={profile.name}
          style={{ display: profile.id === activeProfileId ? 'block' : 'none' }}
          className={`w-full h-full border-none absolute inset-0 ${isInteractingWithOverlay && profile.id === activeProfileId ? 'pointer-events-none opacity-90' : 'pointer-events-auto opacity-100'}`}
          allowFullScreen
        />
      ))}
      {!profiles.some(p => p.url && p.id === activeProfileId) && (
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          <div className="flex flex-col items-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <p className="text-xl">No URL configured</p>
          </div>
        </div>
      )}
    </div>
  );
};

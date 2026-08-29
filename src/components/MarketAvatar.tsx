import React, { useState, useEffect } from 'react';

interface MarketAvatarProps {
  photoUrl?: string;
  fullName?: string;
  className?: string;
  fallbackClassName?: string;
  crossOrigin?: "" | "anonymous" | "use-credentials";
}

export default function MarketAvatar({ photoUrl, fullName, className = '', fallbackClassName = 'bg-emerald-100 text-emerald-700', crossOrigin }: MarketAvatarProps) {
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
  }, [photoUrl]);

  if (photoUrl && photoUrl.length > 10 && !error) {
    return (
      <img 
        src={photoUrl} 
        alt={fullName || 'Avatar'} 
        className={`object-cover ${className}`} 
        onError={() => setError(true)} 
        {...(crossOrigin ? { crossOrigin } : {})}
      />
    );
  }

  return (
    <div className={`flex items-center justify-center font-bold uppercase ${className} ${fallbackClassName}`}>
      {fullName?.charAt(0) || 'U'}
    </div>
  );
}

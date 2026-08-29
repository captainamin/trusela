import React from 'react';
import logo from '../assets/logo.png';

const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#001f3f] z-50 overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-yellow/5 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-navy-light/20 rounded-full blur-[120px] animate-pulse"></div>

      <div className="relative flex flex-col items-center space-y-8">
        {/* Logo Container with Glow */}
        <div className="relative w-32 h-32 md:w-40 md:h-40 group">
          <div className="absolute inset-0 bg-yellow/20 rounded-[2.5rem] blur-[40px] group-hover:bg-yellow/30 transition-all duration-700 animate-pulse"></div>
          <img 
            src={logo} 
            alt="Trusela Logo" 
            className="relative w-full h-full object-contain drop-shadow-2xl animate-fade-in-up rounded-[2.5rem]"
          />
        </div>

        {/* Text and Loading */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-sm font-outfit">
            Trusela
          </h1>
          
          <div className="flex items-center justify-center space-x-2">
            <span className="text-yellow/80 text-sm font-medium tracking-[0.2em] uppercase">Loading</span>
            <div className="flex space-x-1.5 pt-1">
              <div className="w-1.5 h-1.5 bg-yellow rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-1.5 h-1.5 bg-yellow rounded-full animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-1.5 h-1.5 bg-yellow rounded-full animate-bounce"></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* CSS for custom animations if not in Tailwind */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-up {
          animation: fade-in-up 1s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;

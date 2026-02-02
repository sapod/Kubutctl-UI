import React from 'react';
import { Loader2, Shield } from 'lucide-react';

interface ConnectionVerificationOverlayProps {
  isVisible: boolean;
  message?: string;
}

export const ConnectionVerificationOverlay: React.FC<ConnectionVerificationOverlayProps> = ({
  isVisible,
  message = 'Verifying connection...'
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-gray-950/95 backdrop-blur-sm z-[9999] flex items-center justify-center">
      <div className="bg-gray-900 rounded-lg p-8 shadow-2xl border border-gray-800 max-w-md mx-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <Shield className="w-16 h-16 text-blue-500 absolute" />
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-gray-100">
              {message}
            </h2>
            <p className="text-sm text-gray-400">
              Please wait while we verify your cluster connection...
            </p>
          </div>

          <div className="w-full bg-gray-800 rounded-full h-1 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 animate-pulse" style={{ width: '60%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};


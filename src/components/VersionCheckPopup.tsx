import React, { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { BACKEND_BASE_URL } from '../consts';

interface VersionCheckPopupProps {
  currentVersion: string;
}

export const VersionCheckPopup: React.FC<VersionCheckPopupProps> = ({ currentVersion }) => {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    // Check if user dismissed this version before
    const dismissedVersion = localStorage.getItem('kubectl-ui-dismissed-version');
    
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/version/check`);
      const data = await response.json();
      
      if (data.latestVersion && data.latestVersion !== currentVersion && data.latestVersion !== dismissedVersion) {
        setLatestVersion(data.latestVersion);
        setIsVisible(true);
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    }
  };

  const handleDismiss = () => {
    if (latestVersion) {
      localStorage.setItem('kubectl-ui-dismissed-version', latestVersion);
    }
    setIsVisible(false);
  };

  if (!isVisible || !latestVersion) return null;

  return (
    <div className="fixed top-20 right-4 z-[60] bg-gray-900 rounded-lg shadow-2xl border border-gray-700 p-4 max-w-md animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-gray-100">
            New Version Available
          </h3>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-400">
          Current version: <span className="font-mono text-gray-200">{currentVersion}</span>
        </p>
        <p className="text-sm text-gray-400">
          Latest version: <span className="font-mono text-green-400 font-bold">{latestVersion}</span>
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Update your Docker container to get the latest features and fixes.
        </p>
      </div>

      <div className="flex gap-2">
        <a
          href="https://hub.docker.com/r/sapod/kubectl-ui/tags"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          View on Docker Hub
        </a>
        <button
          onClick={handleDismiss}
          className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-md text-sm font-medium transition-colors border border-gray-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};


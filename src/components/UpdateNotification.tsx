import React, { useEffect, useState } from 'react';
import { X, Download, RefreshCw } from 'lucide-react';

export const UpdateNotification: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [currentVersion, setCurrentVersion] = useState('');
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron || !electron.isElectron) return;

    // Cleanup expired dismissals from localStorage
    const cleanupExpiredDismissals = () => {
      const now = Date.now();
      const keysToRemove: string[] = [];

      // Check all localStorage keys for expired dismissals
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kubectl-ui-dismissed-')) {
          const timestamp = localStorage.getItem(key);
          if (timestamp) {
            const dismissedUntil = parseInt(timestamp, 10);
            if (now >= dismissedUntil) {
              keysToRemove.push(key);
            }
          }
        }
      }

      // Remove expired entries
      keysToRemove.forEach(key => localStorage.removeItem(key));
    };

    // Run cleanup on mount
    cleanupExpiredDismissals();

    // Get current version
    electron.getAppVersion().then((version: string) => {
      setCurrentVersion(version);
    });

    // Check for updates on initial load
    if (electron.checkForUpdates) {
      electron.checkForUpdates();
    }

    // Listen for update events
    if (electron.onUpdateAvailable) {
      electron.onUpdateAvailable((info: any) => {
        // Check if this is an auto-download request (from manual update check)
        const isAutoDownload = info.autoDownload === true;

        // Only check for dismissal if this is NOT an auto-download
        if (!isAutoDownload) {
          // Check if user dismissed this version within the last 24 hours
          const dismissedUntil = localStorage.getItem(`kubectl-ui-dismissed-${info.version}`);
          if (dismissedUntil) {
            const dismissedTimestamp = parseInt(dismissedUntil, 10);
            const now = Date.now();
            if (now < dismissedTimestamp) {
              // Still within the 24-hour dismissal period
              return;
            } else {
              // Expired, remove it
              localStorage.removeItem(`kubectl-ui-dismissed-${info.version}`);
            }
          }
        }

        setUpdateInfo(info);
        setIsVisible(true);
        setDownloadError(null);

        // If autoDownload flag is set, automatically start downloading
        if (isAutoDownload) {
          setIsDownloading(true);
          setDownloadProgress(0);
        }
      });
    }

    if (electron.onDownloadProgress) {
      electron.onDownloadProgress((progress: any) => {
        setDownloadProgress(Math.round(progress.percent));
        setDownloadError(null);
      });
    }

    if (electron.onUpdateDownloaded) {
      electron.onUpdateDownloaded(() => {
        setIsDownloaded(true);
        setIsDownloading(false);
        setDownloadError(null);
      });
    }

    if (electron.onUpdateError) {
      electron.onUpdateError((error: any) => {
        setDownloadError(error.message || 'Update error occurred');
        setIsDownloading(false);
      });
    }

    // Check for updates when page becomes visible (handles refresh with Cmd+R)
    const handleVisibilityChange = () => {
      if (!document.hidden && electron.checkForUpdates) {
        electron.checkForUpdates();
      }
    };

    // Check for updates when window regains focus
    const handleFocus = () => {
      if (electron.checkForUpdates) {
        electron.checkForUpdates();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleDownload = async () => {
    const electron = (window as any).electron;
    if (!electron) return;

    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(0);

    try {
      const result = await electron.downloadUpdate();

      if (!result.success) {
        setDownloadError(result.error || 'Failed to start download');
        setIsDownloading(false);
      }

      // Set timeout to detect stalled downloads
      setTimeout(() => {
        if (isDownloading && downloadProgress === 0 && !isDownloaded) {
          setDownloadError('Download stalled. Please check your internet connection or try again later.');
          setIsDownloading(false);
        }
      }, 30000);
    } catch (error: any) {
      setDownloadError(error.message || 'Failed to download update');
      setIsDownloading(false);
    }
  };

  const handleInstall = async () => {
    const electron = (window as any).electron;
    if (!electron) {
      setDownloadError('Electron API not available');
      return;
    }

    if (isInstalling) return;

    setIsInstalling(true);
    setDownloadError(null);

    try {
      const result = await electron.installUpdate();

      // If result is undefined or success is true, installation is in progress
      // The app will quit and restart automatically
      if (!result || result.success !== false) {
        // Keep installing state - app should quit soon
        setTimeout(() => {
          if (isInstalling) {
            setIsInstalling(false);
          }
        }, 15000);
      } else {
        // Explicit failure with error message
        setDownloadError(result.error || 'Installation failed');
        setIsInstalling(false);
      }
    } catch (error: any) {
      setDownloadError(error.message || 'Installation failed');
      setIsInstalling(false);
    }
  };

  const handleDownloadManually = async () => {
    const electron = (window as any).electron;
    const url = 'https://github.com/sapod/Kubutctl-UI/releases/latest';

    if (electron && electron.openExternal) {
      try {
        await electron.openExternal(url);
      } catch (err) {
        window.open(url, '_blank');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  const handleDismiss = () => {
    if (updateInfo?.version) {
      // Store timestamp 24 hours in the future
      const dismissUntil = Date.now() + (24 * 60 * 60 * 1000);
      localStorage.setItem(`kubectl-ui-dismissed-${updateInfo.version}`, dismissUntil.toString());
    }
    setIsVisible(false);
  };

  if (!isVisible || !updateInfo) return null;

  return (
    <div className="fixed top-20 right-4 z-[400] bg-gray-900 rounded-lg shadow-2xl border border-gray-700 p-4 max-w-md animate-slide-in">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-gray-100">
            {isDownloaded ? 'Update Ready to Install' : 'New Version Available'}
          </h3>
        </div>
        {!isDownloaded && (
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-400">
          Current version: <span className="font-mono text-gray-200">{currentVersion}</span>
        </p>
        <p className="text-sm text-gray-400">
          New version: <span className="font-mono text-green-400 font-bold">{updateInfo.version}</span>
        </p>
        
        <button
          onClick={() => {
            const electron = (window as any).electron;
            const url = `https://github.com/sapod/Kubutctl-UI/releases/tag/v${updateInfo.version}`;
            if (electron && electron.openExternal) {
              electron.openExternal(url).catch(() => window.open(url, '_blank'));
            } else {
              window.open(url, '_blank');
            }
          }}
          className="text-xs text-blue-400 hover:text-blue-300 underline transition-colors"
        >
          View release notes →
        </button>

        {isDownloading && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Downloading...</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {isDownloaded && !isInstalling && (
          <div className="mt-2 p-2 bg-green-900/20 border border-green-700 rounded text-xs text-green-400">
            Update downloaded. Click Install to update automatically.
          </div>
        )}

        {isInstalling && (
          <div className="mt-2 p-2 bg-blue-900/20 border border-blue-700 rounded text-xs text-blue-400">
            Installing update... Please wait. The app will restart automatically.
          </div>
        )}

        {downloadError && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-700 rounded text-xs text-red-400">
            {downloadError}
          </div>
        )}

        {!isDownloaded && !isDownloading && !downloadError && (
          <p className="text-xs text-gray-500 mt-2">
            Click Download to get the latest version. The app will restart after installation.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {!isDownloaded && !isDownloading && (
          <>
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              {downloadError ? 'Retry Download' : 'Download Update'}
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-md text-sm font-medium transition-colors border border-gray-700"
            >
              Later
            </button>
          </>
        )}

        {isDownloaded && !isInstalling && (
          <>
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Install Update
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-gray-300 hover:bg-gray-800 rounded-md text-sm font-medium transition-colors border border-gray-700"
            >
              Later
            </button>
          </>
        )}

        {isInstalling && (
          <button
            disabled
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 cursor-not-allowed text-white rounded-md text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4 animate-spin" />
            Installing...
          </button>
        )}

        {downloadError && isDownloaded && (
          <button
            onClick={handleDownloadManually}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Manually
          </button>
        )}
      </div>
    </div>
  );
};


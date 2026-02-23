import React, { useState, useEffect } from 'react';
import { Folder, File, Download, RefreshCw, Home } from 'lucide-react';
import { BACKEND_BASE_URL } from '../consts';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modTime?: string;
}

interface FileExplorerProps {
  pvName: string;
  namespace: string;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ pvName, namespace }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingPaths, setDownloadingPaths] = useState<Set<string>>(new Set());

  // Fetch files for the current path
  const fetchFiles = async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/pv/files?pvName=${encodeURIComponent(pvName)}&namespace=${encodeURIComponent(namespace)}&path=${encodeURIComponent(path)}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.statusText}`);
      }

      const data = await response.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Load files when component mounts or path changes
  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, pvName, namespace]);

  // Navigate to a directory
  const navigateToDirectory = (dirPath: string) => {
    setCurrentPath(dirPath);
  };

  // Go up one directory
  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath('/' + parts.join('/'));
  };

  // Download a file or folder
  const handleDownload = async (item: FileItem) => {
    setDownloadingPaths(prev => new Set(prev).add(item.path));

    try {
      const endpoint = item.isDirectory
        ? `/api/pv/download-folder`
        : `/api/pv/download-file`;

      const response = await fetch(`${BACKEND_BASE_URL}${endpoint}?pvName=${encodeURIComponent(pvName)}&namespace=${encodeURIComponent(namespace)}&path=${encodeURIComponent(item.path)}`);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = item.name;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // If it's a directory, append .tar.gz (backend sends tar.gz, not zip)
      if (item.isDirectory && !filename.endsWith('.tar.gz')) {
        filename += '.tar.gz';
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Download error:', err);
      setError(err.message || 'Download failed');
    } finally {
      setDownloadingPaths(prev => {
        const next = new Set(prev);
        next.delete(item.path);
        return next;
      });
    }
  };

  // Format file size
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Format modification time
  const formatModTime = (modTime?: string): string => {
    if (!modTime) return '-';
    try {
      const date = new Date(modTime);
      return date.toLocaleString();
    } catch {
      return modTime;
    }
  };

  // Render breadcrumb navigation
  const renderBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);

    return (
      <div className="flex items-center gap-2 text-sm mb-4">
        <button
          onClick={() => setCurrentPath('/')}
          className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
          title="Go to root"
        >
          <Home size={14} />
          <span>root</span>
        </button>

        {parts.map((part, index) => {
          const path = '/' + parts.slice(0, index + 1).join('/');
          return (
            <React.Fragment key={path}>
              <span className="text-gray-500">/</span>
              <button
                onClick={() => navigateToDirectory(path)}
                className="text-blue-400 hover:text-blue-300 transition-colors"
              >
                {part}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with breadcrumbs and actions */}
      <div className="border-b border-gray-700 pb-3 mb-3">
        {renderBreadcrumbs()}

        <div className="flex items-center gap-2">
          {currentPath !== '/' && (
            <button
              onClick={navigateUp}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors"
            >
              ← Up
            </button>
          )}

          <button
            onClick={() => fetchFiles(currentPath)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-xs text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded p-3 mb-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && files.length === 0 && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Loading files...
        </div>
      )}

      {/* Empty state */}
      {!loading && files.length === 0 && !error && (
        <div className="flex items-center justify-center py-12 text-gray-500 text-sm">
          This directory is empty
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex-1 overflow-auto custom-scrollbar">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Name</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Size</th>
                <th className="text-left py-2 px-3 font-medium text-gray-400">Modified</th>
                <th className="text-right py-2 px-3 font-medium text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((item) => (
                <tr
                  key={item.path}
                  className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
                >
                  <td className="py-2 px-3">
                    <button
                      onClick={() => item.isDirectory ? navigateToDirectory(item.path) : null}
                      className={`flex items-center gap-2 ${item.isDirectory ? 'text-blue-400 hover:text-blue-300 cursor-pointer' : 'text-gray-300'}`}
                    >
                      {item.isDirectory ? (
                        <Folder size={16} className="text-yellow-500" />
                      ) : (
                        <File size={16} className="text-gray-500" />
                      )}
                      <span>{item.name}</span>
                    </button>
                  </td>
                  <td className="py-2 px-3 text-gray-400">
                    {item.isDirectory ? '-' : formatSize(item.size)}
                  </td>
                  <td className="py-2 px-3 text-gray-400 text-xs">
                    {formatModTime(item.modTime)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => handleDownload(item)}
                      disabled={downloadingPaths.has(item.path)}
                      className="px-2 py-1 bg-blue-900/30 hover:bg-blue-900/50 border border-blue-800 rounded text-xs text-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ml-auto"
                      title={item.isDirectory ? 'Download as tar.gz' : 'Download file'}
                    >
                      <Download size={12} />
                      {downloadingPaths.has(item.path) ? 'Downloading...' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};


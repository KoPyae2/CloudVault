"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Download, 
  X, 
  Pause, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  MoreVertical,
  Trash2,
  Save
} from 'lucide-react';
import { useDownloadManager, DownloadFile } from './download-manager';

const formatTimeRemaining = (totalSize: number, progress: number, speed: number) => {
  if (!speed || progress >= 100) return '';
  
  const remainingBytes = totalSize * (100 - progress) / 100;
  const remainingSeconds = remainingBytes / speed;
  
  if (remainingSeconds < 60) {
    return `${Math.round(remainingSeconds)}s`;
  } else if (remainingSeconds < 3600) {
    return `${Math.round(remainingSeconds / 60)}m`;
  } else {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.round((remainingSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

export function DownloadProgress() {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    downloads, 
    removeDownload, 
    pauseDownload, 
    resumeDownload, 
    cancelDownload, 
    clearCompleted,
    isDownloading,
  } = useDownloadManager();

  const activeDownloads = downloads.filter(d => 
    d.status === 'downloading' || d.status === 'pending' || d.status === 'paused'
  );

  const completedDownloads = downloads.filter(d => 
    d.status === 'completed' || d.status === 'error' || d.status === 'cancelled'
  );

  if (downloads.length === 0) return null;

  return (
    <>
      {/* Download Indicator Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <Download className="h-4 w-4" />
        {isDownloading && (
          <div className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
        )}
        {downloads.length > 0 && (
          <span className="ml-1 text-xs">
            {activeDownloads.length > 0 ? activeDownloads.length : downloads.length}
          </span>
        )}
      </Button>

      {/* Download Progress Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between pr-10">
            <DialogTitle>Download Manager</DialogTitle>
            {completedDownloads.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCompleted}
                className="mr-2"
              >
                Clear Completed
              </Button>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            {downloads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Download className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500">No downloads</p>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-96">
                {/* Active Downloads */}
                {activeDownloads.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">
                      Active Downloads ({activeDownloads.length})
                    </h3>
                    <div className="space-y-3">
                      {activeDownloads.map((download) => (
                        <DownloadItem
                          key={download.id}
                          download={download}
                          onPause={() => pauseDownload(download.id)}
                          onResume={() => resumeDownload(download.id)}
                          onCancel={() => cancelDownload(download.id)}
                          onRemove={() => removeDownload(download.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Downloads */}
                {completedDownloads.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">
                      Completed ({completedDownloads.length})
                    </h3>
                    <div className="space-y-3">
                      {completedDownloads.map((download) => (
                        <DownloadItem
                          key={download.id}
                          download={download}
                          onRemove={() => removeDownload(download.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface DownloadItemProps {
  download: DownloadFile;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRemove: () => void;
}

function DownloadItem({ download, onPause, onResume, onCancel, onRemove }: DownloadItemProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleSaveFile = () => {
    if (download.downloadedBlob) {
      const url = URL.createObjectURL(download.downloadedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = download.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const getStatusIcon = (status: DownloadFile['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <X className="h-4 w-4 text-gray-500" />;
      case 'paused':
        return <Pause className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'downloading':
        return (
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: DownloadFile['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed & Saved';
      case 'error':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'paused':
        return 'Paused';
      case 'pending':
        return 'Pending';
      case 'downloading':
        return 'Downloading';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      {getStatusIcon(download.status)}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {download.name}
          </p>
          <div className="flex items-center space-x-2">
            {download.status === 'completed' && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                Auto-saved
              </span>
            )}
            <span className="text-xs text-gray-500">
              {getStatusText(download.status)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>
            {download.status === 'downloading' && download.progress > 0 ? (
              <>
                {formatFileSize(download.size * download.progress / 100)} / {formatFileSize(download.size)}
                {download.currentChunk !== undefined && download.totalChunks > 1 && (
                  <span className="ml-1 text-blue-600">
                    (Chunk {download.currentChunk}/{download.totalChunks})
                  </span>
                )}
              </>
            ) : (
              <>
                {formatFileSize(download.size)}
                {download.totalChunks > 1 && (
                  <span className="ml-1 text-gray-400">
                    ({download.totalChunks} chunks)
                  </span>
                )}
              </>
            )}
          </span>
          {(download.status === 'downloading' || download.status === 'paused') && (
            <div className="flex items-center space-x-1 text-right">
              <span className="font-medium">{download.progress.toFixed(1)}%</span>
              {download.status === 'downloading' && download.downloadSpeed && (
                <>
                  <span>•</span>
                  <span className="text-green-600">{formatFileSize(download.downloadSpeed)}/s</span>
                </>
              )}
              {download.status === 'downloading' && download.downloadSpeed && download.progress > 0 && download.progress < 100 && (
                <>
                  <span>•</span>
                  <span className="text-blue-600">ETA: {formatTimeRemaining(download.size, download.progress, download.downloadSpeed)}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {(download.status === 'downloading' || download.status === 'paused' || download.status === 'completed') && (
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                download.status === 'completed' 
                  ? 'bg-green-500' 
                  : download.status === 'paused' 
                    ? 'bg-yellow-500' 
                    : 'bg-blue-500'
              }`}
              style={{ width: `${download.progress}%` }}
            />
          </div>
        )}

        {/* Error Message */}
        {download.status === 'error' && download.error && (
          <p className="text-xs text-red-500 mt-1">{download.error}</p>
        )}
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {download.status === 'completed' && download.downloadedBlob && (
            <DropdownMenuItem onClick={handleSaveFile}>
              <Save className="h-4 w-4 mr-2" />
              Save File
            </DropdownMenuItem>
          )}
          {download.status === 'downloading' && onPause && (
            <DropdownMenuItem onClick={onPause}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </DropdownMenuItem>
          )}
          {download.status === 'paused' && onResume && (
            <DropdownMenuItem onClick={onResume}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </DropdownMenuItem>
          )}
          {(download.status === 'downloading' || download.status === 'paused' || download.status === 'pending') && onCancel && (
            <DropdownMenuItem onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onRemove}>
            <Trash2 className="h-4 w-4 mr-2" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
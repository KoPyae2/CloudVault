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
  Upload, 
  X, 
  Pause, 
  Play, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  MoreVertical,
  Trash2
} from 'lucide-react';
import { useUploadManager, UploadFile } from './upload-manager';

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

export function UploadProgress() {
  const [isOpen, setIsOpen] = useState(false);
  const { 
    uploads, 
    removeUpload, 
    pauseUpload, 
    resumeUpload, 
    cancelUpload, 
    clearCompleted,
    isUploading,
    totalProgress 
  } = useUploadManager();

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadFile['status']) => {
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
      case 'uploading':
        return (
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'paused':
        return 'Paused';
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading';
      default:
        return 'Unknown';
    }
  };

  const activeUploads = uploads.filter(u => 
    u.status === 'uploading' || u.status === 'pending' || u.status === 'paused'
  );

  const completedUploads = uploads.filter(u => 
    u.status === 'completed' || u.status === 'error' || u.status === 'cancelled'
  );

  if (uploads.length === 0) return null;

  return (
    <>
      {/* Upload Indicator Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="relative"
      >
        <Upload className="h-4 w-4" />
        {isUploading && (
          <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full animate-pulse" />
        )}
        {uploads.length > 0 && (
          <span className="ml-1 text-xs">
            {activeUploads.length > 0 ? activeUploads.length : uploads.length}
          </span>
        )}
      </Button>

      {/* Upload Progress Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex flex-row items-center justify-between pr-10">
            <DialogTitle>Upload Manager</DialogTitle>
            {completedUploads.length > 0 && (
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
            {uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Upload className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500">No uploads</p>
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-96">
                {/* Active Uploads */}
                {activeUploads.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">
                      Active Uploads ({activeUploads.length})
                    </h3>
                    <div className="space-y-3">
                      {activeUploads.map((upload) => (
                        <UploadItem
                          key={upload.id}
                          upload={upload}
                          onPause={() => pauseUpload(upload.id)}
                          onResume={() => resumeUpload(upload.id)}
                          onCancel={() => cancelUpload(upload.id)}
                          onRemove={() => removeUpload(upload.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Uploads */}
                {completedUploads.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-3">
                      Completed ({completedUploads.length})
                    </h3>
                    <div className="space-y-3">
                      {completedUploads.map((upload) => (
                        <UploadItem
                          key={upload.id}
                          upload={upload}
                          onRemove={() => removeUpload(upload.id)}
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

interface UploadItemProps {
  upload: UploadFile;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRemove: () => void;
}

function UploadItem({ upload, onPause, onResume, onCancel, onRemove }: UploadItemProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: UploadFile['status']) => {
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
      case 'uploading':
        return (
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        );
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: UploadFile['status']) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'error':
        return 'Failed';
      case 'cancelled':
        return 'Cancelled';
      case 'paused':
        return 'Paused';
      case 'pending':
        return 'Pending';
      case 'uploading':
        return 'Uploading';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
      {getStatusIcon(upload.status)}
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-gray-900 truncate">
            {upload.name}
          </p>
          <span className="text-xs text-gray-500">
            {getStatusText(upload.status)}
          </span>
        </div>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
          <span>
            {upload.status === 'uploading' && upload.progress > 0 ? (
              <>
                {formatFileSize(upload.size * upload.progress / 100)} / {formatFileSize(upload.size)}
              </>
            ) : (
              formatFileSize(upload.size)
            )}
          </span>
          {(upload.status === 'uploading' || upload.status === 'paused') && (
            <div className="flex items-center space-x-1 text-right">
              <span>{upload.progress.toFixed(1)}%</span>
              {upload.status === 'uploading' && upload.uploadSpeed && (
                <>
                  <span>•</span>
                  <span>{formatFileSize(upload.uploadSpeed)}/s</span>
                </>
              )}
              {upload.status === 'uploading' && upload.uploadSpeed && upload.progress > 0 && upload.progress < 100 && (
                <>
                  <span>•</span>
                  <span>ETA: {formatTimeRemaining(upload.size, upload.progress, upload.uploadSpeed)}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {(upload.status === 'uploading' || upload.status === 'paused') && (
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                upload.status === 'paused' ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        )}

        {/* Error Message */}
        {upload.status === 'error' && upload.error && (
          <p className="text-xs text-red-500 mt-1">{upload.error}</p>
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
          {upload.status === 'uploading' && onPause && (
            <DropdownMenuItem onClick={onPause}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </DropdownMenuItem>
          )}
          {upload.status === 'paused' && onResume && (
            <DropdownMenuItem onClick={onResume}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </DropdownMenuItem>
          )}
          {(upload.status === 'uploading' || upload.status === 'paused' || upload.status === 'pending') && onCancel && (
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
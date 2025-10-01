"use client";

import { UploadManagerProvider } from './upload-manager';
import { DownloadManagerProvider } from './download-manager';

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  return (
    <UploadManagerProvider>
      <DownloadManagerProvider>
        {children}
      </DownloadManagerProvider>
    </UploadManagerProvider>
  );
}
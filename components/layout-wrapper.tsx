"use client";

import { UploadManagerProvider } from './upload-manager';

interface LayoutWrapperProps {
  children: React.ReactNode;
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  return (
    <UploadManagerProvider>
      {children}
    </UploadManagerProvider>
  );
}
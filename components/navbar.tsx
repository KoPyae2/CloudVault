"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UploadProgress } from "./upload-progress";
import { DownloadProgress } from "./download-progress";
import { Cloud, Home, ChevronRight, Wifi, WifiOff, User, Settings, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { useStore } from "@/lib/store";
import type { Id } from "@/convex/_generated/dataModel";

export interface NavbarFolder {
  _id: string | number;
  name: string;
}

interface NavbarProps {
  session: {
    user?: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
  folderPath: NavbarFolder[];
}

export function Navbar({ session, folderPath }: NavbarProps) {
  const setCurrentFolderId = useStore(s => s.setCurrentFolderId);
  const [isOnline, setIsOnline] = useState(true);

  // Initialize online status and set up event listeners
  useEffect(() => {
    // Set initial status
    setIsOnline(navigator.onLine);

    // Event handlers
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const goRoot = () => setCurrentFolderId(undefined);
  const goToCrumb = (id: string | number) => setCurrentFolderId(id as Id<'folders'>);

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left side - Logo and Navigation */}
        <div className="flex items-center space-x-4">
          <button onClick={goRoot} className="flex items-center space-x-2">
            <Cloud className="h-8 w-8 text-emerald-600" />
            <span className="text-xl font-bold text-gray-900">CloudVault</span>
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <button onClick={goRoot} className="inline-flex items-center hover:text-gray-900">
              <Home className="h-4 w-4 text-emerald-600" />
              <span className="ml-1">My Files</span>
            </button>
            {folderPath.map((folder) => (
              <React.Fragment key={String(folder._id)}>
                <ChevronRight className="h-4 w-4" />
                <button
                  onClick={() => goToCrumb(folder._id)}
                  className="max-w-[160px] truncate inline-block align-bottom hover:text-gray-900"
                  title={folder.name}
                >
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right side - User menu */}
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 text-sm">
            {isOnline ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-600">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <span className="text-red-500">Offline</span>
              </>
            )}
          </div>

          {/* Upload Progress */}
          <UploadProgress />
          
          {/* Download Progress */}
          <DownloadProgress />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || ""} />
                  <AvatarFallback>
                    {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <div className="flex items-center justify-start gap-2 p-2">
                <div className="flex flex-col space-y-1 leading-none">
                  <p className="font-medium">{session?.user?.name}</p>
                  <p className="w-[200px] truncate text-sm text-muted-foreground">{session?.user?.email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default Navbar;
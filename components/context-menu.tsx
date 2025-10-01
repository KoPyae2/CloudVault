"use client";

import React from "react";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Edit, Move, Copy, Trash2, FileText, Download } from "lucide-react";

export type UnifiedMenuKind = "file" | "folder";

export interface UnifiedMenuProps {
  kind: UnifiedMenuKind;
  name: string;
  // Actions
  onDownload?: () => void; // Only for files
  onRename: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onProperties: () => void;
}

// Unified dropdown menu content for all interactions
export function UnifiedDropdownMenuContent(props: UnifiedMenuProps) {
  const { kind, onDownload, onRename, onMove, onCopy, onDelete, onProperties } = props;
  
  return (
    <DropdownMenuContent>
      {/* Download option only for files */}
      {kind === "file" && onDownload && (
        <>
          <DropdownMenuItem onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      
      <DropdownMenuItem onClick={(e) => {
        e.stopPropagation();
        onRename();
      }}>
        <Edit className="h-4 w-4 mr-2" />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => {
        e.stopPropagation();
        onMove();
      }}>
        <Move className="h-4 w-4 mr-2" />
        Move
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </DropdownMenuItem>
      <DropdownMenuItem onClick={(e) => {
        e.stopPropagation();
        onProperties();
      }}>
        <FileText className="h-4 w-4 mr-2" />
        Properties
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-red-600" onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

// Unified popover menu content for all interactions
export function UnifiedPopoverMenuContent(props: UnifiedMenuProps) {
  const { kind, onDownload, onRename, onMove, onCopy, onDelete, onProperties } = props;
  
  return (
    <div className="w-48 p-1">
      {/* Download option only for files */}
      {kind === "file" && onDownload && (
        <>
          <Button
            variant="ghost"
            className="w-full justify-start h-8 px-2 text-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDownload();
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <div className="h-px bg-border my-1" />
        </>
      )}
      
      <Button
        variant="ghost"
        className="w-full justify-start h-8 px-2 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <Edit className="h-4 w-4 mr-2" />
        Rename
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start h-8 px-2 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          onMove();
        }}
      >
        <Move className="h-4 w-4 mr-2" />
        Move
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start h-8 px-2 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          onCopy();
        }}
      >
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </Button>
      <Button
        variant="ghost"
        className="w-full justify-start h-8 px-2 text-sm"
        onClick={(e) => {
          e.stopPropagation();
          onProperties();
        }}
      >
        <FileText className="h-4 w-4 mr-2" />
        Properties
      </Button>
      <div className="h-px bg-border my-1" />
      <Button
        variant="ghost"
        className="w-full justify-start h-8 px-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </Button>
    </div>
  );
}
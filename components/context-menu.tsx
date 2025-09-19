"use client";

import React from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Edit, Move, Copy, Trash2, FileText } from "lucide-react";

export type UnifiedMenuKind = "file" | "folder";

export interface UnifiedMenuProps {
  kind: UnifiedMenuKind;
  name: string;
  // Actions
  onRename: () => void;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onProperties: () => void;
  as: "context" | "dropdown";
}

// Internal render for items
function MenuItems({ onRename, onMove, onCopy, onDelete, onProperties }: Omit<UnifiedMenuProps, "kind" | "name" | "as">) {
  return (
    <>
      <MenuItem onClick={onRename} icon={<Edit className="h-4 w-4 mr-2" />}>Rename</MenuItem>
      <MenuItem onClick={onMove} icon={<Move className="h-4 w-4 mr-2" />}>Move</MenuItem>
      <MenuItem onClick={onCopy} icon={<Copy className="h-4 w-4 mr-2" />}>Copy</MenuItem>
      <MenuItem onClick={onDelete} icon={<Trash2 className="h-4 w-4 mr-2" />} destructive>Delete</MenuItem>
      <MenuItem onClick={onProperties} icon={<FileText className="h-4 w-4 mr-2" />}>Properties</MenuItem>
    </>
  );
}

// MenuItem abstraction for both Context and Dropdown
function MenuItem({ onClick, icon, children, destructive }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode; destructive?: boolean }) {
  // Render both variants depending on parent kind via React context detection is overkill; instead, we export two wrappers
  return null;
}

// Context variant
export function UnifiedContextMenuContent(props: UnifiedMenuProps) {
  const { onRename, onMove, onCopy, onDelete, onProperties } = props;
  return (
    <ContextMenuContent>
      <ContextMenuItem onClick={onRename}>
        <Edit className="h-4 w-4 mr-2" />
        Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={onMove}>
        <Move className="h-4 w-4 mr-2" />
        Move
      </ContextMenuItem>
      <ContextMenuItem onClick={onCopy}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem className="text-red-600" onClick={onDelete}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </ContextMenuItem>
      <ContextMenuItem onClick={onProperties}>
        <FileText className="h-4 w-4 mr-2" />
        Properties
      </ContextMenuItem>
    </ContextMenuContent>
  );
}

// Dropdown variant (3-dots)
export function UnifiedDropdownMenuContent(props: UnifiedMenuProps) {
  const { onRename, onMove, onCopy, onDelete, onProperties } = props;
  return (
    <DropdownMenuContent>
      <DropdownMenuItem onClick={onRename}>
        <Edit className="h-4 w-4 mr-2" />
        Rename
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onMove}>
        <Move className="h-4 w-4 mr-2" />
        Move
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onCopy}>
        <Copy className="h-4 w-4 mr-2" />
        Copy
      </DropdownMenuItem>
      <DropdownMenuItem className="text-red-600" onClick={onDelete}>
        <Trash2 className="h-4 w-4 mr-2" />
        Delete
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onProperties}>
        <FileText className="h-4 w-4 mr-2" />
        Properties
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
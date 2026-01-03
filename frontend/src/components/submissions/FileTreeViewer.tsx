/**
 * Recursive file tree viewer for submission files.
 * Files are flat with paths like `src/main.py` — we build a tree client-side.
 */
import { File as FileIcon, Folder, FolderOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { SubmissionFile } from '@/api/endpoints/submissions';
import { formatBytes } from '@/utils/formatters';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/components/ui/utils';

interface Node {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, Node>;
  file?: SubmissionFile;
}

function buildTree(files: SubmissionFile[]): Node {
  const root: Node = {
    name: '',
    path: '',
    isDir: true,
    children: new Map(),
  };
  for (const f of files) {
    const parts = f.path.split('/').filter(Boolean);
    let cursor = root;
    let acc = '';
    parts.forEach((part, idx) => {
      acc = acc ? `${acc}/${part}` : part;
      const isLast = idx === parts.length - 1;
      let child = cursor.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: acc,
          isDir: !isLast,
          children: new Map(),
        };
        cursor.children.set(part, child);
      }
      if (isLast) {
        child.isDir = false;
        child.file = f;
      }
      cursor = child;
    });
  }
  return root;
}

interface FileTreeViewerProps {
  files: SubmissionFile[];
  selectedFileId: string | null;
  onSelect: (file: SubmissionFile) => void;
}

interface NodeRowProps {
  node: Node;
  depth: number;
  selectedFileId: string | null;
  onSelect: (file: SubmissionFile) => void;
}

function NodeRow({ node, depth, selectedFileId, onSelect }: NodeRowProps) {
  const [open, setOpen] = useState(true);
  const isFile = !node.isDir && node.file;
  const isSelected = isFile && node.file!.id === selectedFileId;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          if (node.isDir) setOpen((v) => !v);
          else if (node.file) onSelect(node.file);
        }}
        data-testid={`submission-file-tree-node-${node.path}`}
        className={cn(
          'w-full flex items-center gap-1.5 rounded-sm px-2 py-1 text-left transition-colors hover:bg-muted/50',
          isSelected && 'bg-accent/40',
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        {node.isDir ? (
          open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <FileIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="text-xs truncate">{node.name}</span>
        {isFile && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatBytes(node.file!.size_bytes)}
          </span>
        )}
      </button>
      {node.isDir && open && (
        <div className="flex flex-col">
          {Array.from(node.children.values())
            .sort((a, b) => {
              if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <NodeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedFileId={selectedFileId}
                onSelect={onSelect}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeViewer({
  files,
  selectedFileId,
  onSelect,
}: FileTreeViewerProps) {
  const tree = useMemo(() => buildTree(files), [files]);
  const roots = Array.from(tree.children.values()).sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ScrollArea className="h-[400px]">
      <div className="flex flex-col p-2">
        {roots.map((node) => (
          <NodeRow
            key={node.path}
            node={node}
            depth={0}
            selectedFileId={selectedFileId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

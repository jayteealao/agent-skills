// view-src/code-browser/components/tree.tsx
//
// VENDORED from kibo-ui `tree` (https://www.kibo-ui.com/components/tree,
// registry item fetched 2026-06-10), adapted per CODEBASE-BROWSER-PLAN §0.2-8.
// Upstream API preserved (TreeProvider/TreeView/TreeNode/TreeNodeTrigger/
// TreeNodeContent/TreeExpander/TreeIcon/TreeLabel/TreeLines). Deviations:
//   • `motion`/`AnimatePresence` REMOVED (~40 KB gz) — expand/collapse is a
//     conditional render, the chevron rotates via a CSS transition.
//   • NEW `onExpandedChange(nodeId, isExpanded)` on TreeProvider — the lazy
//     tree (lazyTree:true) fetches a folder's children on first expand.
//   • NEW `expandedIds`/`setExpandedIds` exposed through context so the app
//     can expand programmatically after a lazy fetch completes.
//   • `cn` from the local no-dep helper instead of clsx+tailwind-merge.

import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react';
import {
  type HTMLAttributes,
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
} from 'react';
import { cn } from '../lib/cn';

type TreeContextType = {
  expandedIds: Set<string>;
  selectedIds: string[];
  toggleExpanded: (nodeId: string) => void;
  handleSelection: (nodeId: string, ctrlKey: boolean) => void;
  showLines?: boolean;
  showIcons?: boolean;
  selectable?: boolean;
  multiSelect?: boolean;
  indent?: number;
};

const TreeContext = createContext<TreeContextType | undefined>(undefined);

const useTree = () => {
  const context = useContext(TreeContext);
  if (!context) {
    throw new Error('Tree components must be used within a TreeProvider');
  }
  return context;
};

type TreeNodeContextType = {
  nodeId: string;
  level: number;
  isLast: boolean;
  parentPath: boolean[];
};

const TreeNodeContext = createContext<TreeNodeContextType | undefined>(undefined);

const useTreeNode = () => {
  const context = useContext(TreeNodeContext);
  if (!context) {
    throw new Error('TreeNode components must be used within a TreeNode');
  }
  return context;
};

export type TreeProviderProps = {
  children: ReactNode;
  defaultExpandedIds?: string[];
  showLines?: boolean;
  showIcons?: boolean;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  /** Lazy-tree hook: fires AFTER the expansion state flips. */
  onExpandedChange?: (nodeId: string, isExpanded: boolean) => void;
  indent?: number;
  className?: string;
};

export const TreeProvider = ({
  children,
  defaultExpandedIds = [],
  showLines = true,
  showIcons = true,
  selectable = true,
  multiSelect = false,
  selectedIds,
  onSelectionChange,
  onExpandedChange,
  indent = 20,
  className,
}: TreeProviderProps) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(defaultExpandedIds),
  );
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>(
    selectedIds ?? [],
  );

  const isControlled = selectedIds !== undefined && onSelectionChange !== undefined;
  const currentSelectedIds = isControlled ? selectedIds : internalSelectedIds;

  const toggleExpanded = useCallback((nodeId: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      let expanded: boolean;
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
        expanded = false;
      } else {
        newSet.add(nodeId);
        expanded = true;
      }
      onExpandedChange?.(nodeId, expanded);
      return newSet;
    });
  }, [onExpandedChange]);

  const handleSelection = useCallback(
    (nodeId: string, ctrlKey = false) => {
      if (!selectable) return;

      let newSelection: string[];
      if (multiSelect && ctrlKey) {
        newSelection = currentSelectedIds.includes(nodeId)
          ? currentSelectedIds.filter((id) => id !== nodeId)
          : [...currentSelectedIds, nodeId];
      } else {
        newSelection = currentSelectedIds.includes(nodeId) ? [] : [nodeId];
      }

      if (isControlled) {
        onSelectionChange?.(newSelection);
      } else {
        setInternalSelectedIds(newSelection);
      }
    },
    [selectable, multiSelect, currentSelectedIds, isControlled, onSelectionChange],
  );

  return (
    <TreeContext.Provider
      value={{
        expandedIds,
        selectedIds: currentSelectedIds,
        toggleExpanded,
        handleSelection,
        showLines,
        showIcons,
        selectable,
        multiSelect,
        indent,
      }}
    >
      <div className={cn('w-full', className)}>{children}</div>
    </TreeContext.Provider>
  );
};

export type TreeViewProps = HTMLAttributes<HTMLDivElement>;

export const TreeView = ({ className, children, ...props }: TreeViewProps) => (
  <div className={cn('p-2', className)} {...props}>
    {children}
  </div>
);

export type TreeNodeProps = HTMLAttributes<HTMLDivElement> & {
  nodeId?: string;
  level?: number;
  isLast?: boolean;
  parentPath?: boolean[];
  children?: ReactNode;
};

export const TreeNode = ({
  nodeId: providedNodeId,
  level = 0,
  isLast = false,
  parentPath = [],
  children,
  className,
  ...props
}: TreeNodeProps) => {
  const generatedId = useId();
  const nodeId = providedNodeId ?? generatedId;

  // Build the parent path — mark positions where the parent was the last child.
  const currentPath = level === 0 ? [] : [...parentPath];
  if (level > 0 && parentPath.length < level - 1) {
    while (currentPath.length < level - 1) {
      currentPath.push(false);
    }
  }
  if (level > 0) {
    currentPath[level - 1] = isLast;
  }

  return (
    <TreeNodeContext.Provider value={{ nodeId, level, isLast, parentPath: currentPath }}>
      <div className={cn('select-none', className)} {...props}>
        {children}
      </div>
    </TreeNodeContext.Provider>
  );
};

export type TreeNodeTriggerProps = HTMLAttributes<HTMLDivElement>;

export const TreeNodeTrigger = ({
  children,
  className,
  onClick,
  ...props
}: TreeNodeTriggerProps) => {
  const { selectedIds, toggleExpanded, handleSelection, indent } = useTree();
  const { nodeId, level } = useTreeNode();
  const isSelected = selectedIds.includes(nodeId);

  return (
    <div
      className={cn(
        'group relative mx-1 flex cursor-pointer items-center rounded-md px-3 py-1.5 transition-colors duration-150',
        'hover:bg-accent/50',
        isSelected && 'bg-accent/80',
        className,
      )}
      onClick={(e) => {
        toggleExpanded(nodeId);
        handleSelection(nodeId, e.ctrlKey || e.metaKey);
        onClick?.(e);
      }}
      style={{ paddingLeft: level * (indent ?? 0) + 8 }}
      {...props}
    >
      <TreeLines />
      {children}
    </div>
  );
};

export const TreeLines = () => {
  const { showLines, indent } = useTree();
  const { level, isLast, parentPath } = useTreeNode();

  if (!showLines || level === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-0 bottom-0 left-0">
      {Array.from({ length: level }, (_, index) => {
        const shouldHideLine = parentPath[index] === true;
        if (shouldHideLine && index === level - 1) {
          return null;
        }
        return (
          <div
            className="absolute top-0 bottom-0 border-border/40 border-l"
            key={index.toString()}
            style={{
              left: index * (indent ?? 0) + 12,
              display: shouldHideLine ? 'none' : 'block',
            }}
          />
        );
      })}
      <div
        className="absolute top-1/2 border-border/40 border-t"
        style={{
          left: (level - 1) * (indent ?? 0) + 12,
          width: (indent ?? 0) - 4,
          transform: 'translateY(-1px)',
        }}
      />
      {isLast && (
        <div
          className="absolute top-0 border-border/40 border-l"
          style={{ left: (level - 1) * (indent ?? 0) + 12, height: '50%' }}
        />
      )}
    </div>
  );
};

export type TreeNodeContentProps = HTMLAttributes<HTMLDivElement> & {
  hasChildren?: boolean;
};

export const TreeNodeContent = ({
  children,
  hasChildren = false,
  className,
  ...props
}: TreeNodeContentProps) => {
  const { expandedIds } = useTree();
  const { nodeId } = useTreeNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!(hasChildren && isExpanded)) {
    return null;
  }
  return (
    <div className={cn('overflow-hidden', className)} {...props}>
      {children}
    </div>
  );
};

export type TreeExpanderProps = HTMLAttributes<HTMLDivElement> & {
  hasChildren?: boolean;
};

export const TreeExpander = ({
  hasChildren = false,
  className,
  onClick,
  ...props
}: TreeExpanderProps) => {
  const { expandedIds, toggleExpanded } = useTree();
  const { nodeId } = useTreeNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!hasChildren) {
    return <div className="mr-1 h-4 w-4" />;
  }

  return (
    <div
      className={cn(
        'mr-1 flex h-4 w-4 cursor-pointer items-center justify-center',
        'transition-transform duration-150',
        isExpanded && 'rotate-90',
        className,
      )}
      onClick={(e) => {
        e.stopPropagation();
        toggleExpanded(nodeId);
        onClick?.(e);
      }}
      {...props}
    >
      <ChevronRight className="h-3 w-3 text-muted-foreground" />
    </div>
  );
};

export type TreeIconProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
  hasChildren?: boolean;
};

export const TreeIcon = ({
  icon,
  hasChildren = false,
  className,
  ...props
}: TreeIconProps) => {
  const { showIcons, expandedIds } = useTree();
  const { nodeId } = useTreeNode();
  const isExpanded = expandedIds.has(nodeId);

  if (!showIcons) {
    return null;
  }

  const getDefaultIcon = () =>
    hasChildren ? (
      isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />
    ) : (
      <File className="h-4 w-4" />
    );

  return (
    <div
      className={cn(
        'mr-2 flex h-4 w-4 items-center justify-center text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon || getDefaultIcon()}
    </div>
  );
};

export type TreeLabelProps = HTMLAttributes<HTMLSpanElement>;

export const TreeLabel = ({ className, ...props }: TreeLabelProps) => (
  <span className={cn('flex-1 truncate text-sm', className)} {...props} />
);

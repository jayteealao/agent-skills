// view-src/code-browser/main.tsx
//
// The code-browser app (CODEBASE-BROWSER-PLAN §4.1): kibo tree + code-block
// fed by the backend's JSON contracts. Mounts on #sdlc-code-root and reads
// the API base from data-base, so one bundle serves both the hub
// (/r/<id>/__code) and the standalone daemon (/__code).
//
// Data model: the server is the source of truth. `lazyTree` mode fetches one
// folder per expand (…/tree?path=) and merges into `childrenByPath`; eager
// mode gets the whole tree inline. Gitignored nodes arrive badged
// (`ignored:true`) and render dimmed with a tag — shown, never hidden (§3.3).

import { FileCode2, ImageIcon, FileWarning, Link2 } from 'lucide-react';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CodeBlock, CodeBlockBody, CodeBlockContent, CodeBlockCopyButton,
  CodeBlockFilename, CodeBlockHeader, CodeBlockItem,
} from './components/code-block';
import {
  TreeExpander, TreeIcon, TreeLabel, TreeNode, TreeNodeContent,
  TreeNodeTrigger, TreeProvider, TreeView,
} from './components/tree';
import { cn } from './lib/cn';

type ApiNode = {
  name: string;
  path: string;
  type: 'dir' | 'file';
  ignored?: boolean;
  symlink?: boolean;
  lang?: string;
  hasChildren?: boolean;
  children?: ApiNode[];
};

type TreeResponse = {
  id: string | null;
  headBranch: string | null;
  path: string;
  lazy: boolean;
  truncated: boolean;
  nodes: ApiNode[];
};

type BlobResponse = {
  path: string;
  name: string;
  size: number;
  kind: 'text' | 'binary' | 'image';
  language?: string;
  truncated?: boolean;
  content?: string;
  rawUrl: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
  return res.json() as Promise<T>;
}

function App({ base }: { base: string }) {
  const [roots, setRoots] = useState<ApiNode[] | null>(null);
  const [lazy, setLazy] = useState(true);
  const [truncatedRoot, setTruncatedRoot] = useState(false);
  const [childrenByPath, setChildrenByPath] = useState<Map<string, ApiNode[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [blob, setBlob] = useState<BlobResponse | null>(null);
  const [blobLoading, setBlobLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirIndex = useRef<Map<string, ApiNode>>(new Map());

  // Index every dir node we have seen so onExpandedChange can tell dirs from
  // files without a tree search.
  const indexNodes = useCallback((nodes: ApiNode[]) => {
    for (const n of nodes) {
      if (n.type === 'dir') dirIndex.current.set(n.path, n);
      if (n.children) indexNodes(n.children);
    }
  }, []);

  useEffect(() => {
    fetchJson<TreeResponse>(`${base}/tree`).then((t) => {
      indexNodes(t.nodes);
      setRoots(t.nodes);
      setLazy(t.lazy);
      setTruncatedRoot(t.truncated);
    }, (err: Error) => setError(`Could not load the file tree: ${err.message}`));
  }, [base, indexNodes]);

  const loadChildren = useCallback((path: string) => {
    setLoadingDirs((prev) => new Set(prev).add(path));
    fetchJson<TreeResponse>(`${base}/tree?path=${encodeURIComponent(path)}`).then((t) => {
      indexNodes(t.nodes);
      setChildrenByPath((prev) => new Map(prev).set(path, t.nodes));
    }, () => {
      setChildrenByPath((prev) => new Map(prev).set(path, []));
    }).finally(() => {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    });
  }, [base, indexNodes]);

  const onExpandedChange = useCallback((nodeId: string, isExpanded: boolean) => {
    if (!lazy || !isExpanded) return;
    if (!dirIndex.current.has(nodeId)) return;
    if (childrenByPath.has(nodeId)) return;
    loadChildren(nodeId);
  }, [lazy, childrenByPath, loadChildren]);

  const onSelectionChange = useCallback((ids: string[]) => {
    setSelected(ids);
    const path = ids[0];
    if (!path || dirIndex.current.has(path)) { setBlob(null); return; }
    setBlobLoading(true);
    setError(null);
    fetchJson<BlobResponse>(`${base}/blob?path=${encodeURIComponent(path)}`).then(
      (b) => setBlob(b),
      (err: Error) => { setBlob(null); setError(`Could not load ${path}: ${err.message}`); },
    ).finally(() => setBlobLoading(false));
  }, [base]);

  const renderNode = (node: ApiNode, level: number, isLast: boolean, parentPath: boolean[]): JSX.Element => {
    const isDir = node.type === 'dir';
    const kids = isDir ? (node.children ?? childrenByPath.get(node.path)) : undefined;
    const hasChildren = isDir && (node.hasChildren ?? ((kids?.length ?? 0) > 0));
    const isLoading = loadingDirs.has(node.path);
    return (
      <TreeNode key={node.path} nodeId={node.path} level={level} isLast={isLast} parentPath={parentPath}>
        <TreeNodeTrigger>
          <TreeExpander hasChildren={hasChildren} />
          <TreeIcon hasChildren={isDir} />
          <TreeLabel className={cn(node.ignored && 'text-muted-foreground/70')}>
            {node.name}
            {node.ignored ? <span className="cb-tag">ignored</span> : null}
            {node.symlink ? <span className="cb-tag"><Link2 className="inline h-3 w-3" aria-label="symlink" /></span> : null}
          </TreeLabel>
        </TreeNodeTrigger>
        {hasChildren ? (
          <TreeNodeContent hasChildren>
            {isLoading && !kids ? (
              <div className="px-3 py-1 text-muted-foreground text-xs" style={{ paddingLeft: (level + 1) * 20 + 8 }}>loading…</div>
            ) : (
              (kids ?? []).map((child, i, arr) =>
                renderNode(child, level + 1, i === arr.length - 1, [...parentPath, isLast]))
            )}
          </TreeNodeContent>
        ) : null}
      </TreeNode>
    );
  };

  const viewer = useMemo(() => {
    if (blobLoading) return <div className="cb-placeholder">loading…</div>;
    if (!blob) {
      return (
        <div className="cb-placeholder">
          <FileCode2 className="h-8 w-8 opacity-40" />
          <p>Select a file to view it.</p>
        </div>
      );
    }
    if (blob.kind === 'image') {
      return (
        <div className="cb-pane">
          <div className="cb-pane-head">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <span className="cb-pane-name">{blob.path}</span>
            <span className="cb-pane-meta">{formatBytes(blob.size)}</span>
          </div>
          <div className="cb-image-wrap"><img alt={blob.name} src={blob.rawUrl} /></div>
        </div>
      );
    }
    if (blob.kind === 'binary') {
      return (
        <div className="cb-pane">
          <div className="cb-pane-head">
            <FileWarning className="h-4 w-4 text-muted-foreground" />
            <span className="cb-pane-name">{blob.path}</span>
            <span className="cb-pane-meta">{formatBytes(blob.size)}</span>
          </div>
          <div className="cb-placeholder">
            <p>Binary file — not rendered inline.</p>
            <a className="cb-raw-link" href={blob.rawUrl}>download raw ({formatBytes(blob.size)})</a>
          </div>
        </div>
      );
    }
    const data = [{ language: blob.language ?? 'plaintext', filename: blob.path, code: blob.content ?? '' }];
    return (
      <CodeBlock className="cb-codeblock" data={data} value={blob.path}>
        <CodeBlockHeader>
          <CodeBlockFilename icon={<FileCode2 className="h-3.5 w-3.5" />}>{blob.path}</CodeBlockFilename>
          <span className="cb-pane-meta">{formatBytes(blob.size)}{blob.language ? ` · ${blob.language}` : ''}</span>
          <CodeBlockCopyButton />
        </CodeBlockHeader>
        {blob.truncated ? (
          <div className="cb-truncated">
            Showing the first {formatBytes((blob.content ?? '').length)} of {formatBytes(blob.size)} —{' '}
            <a className="cb-raw-link" href={blob.rawUrl}>open raw</a>
          </div>
        ) : null}
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem key={item.filename} value={item.filename}>
              <CodeBlockContent code={item.code} language={item.language} />
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    );
  }, [blob, blobLoading]);

  return (
    <div className="cb-split">
      <aside className="cb-sidebar">
        {error ? <div className="cb-error">{error}</div> : null}
        {truncatedRoot ? <div className="cb-truncated">Listing truncated (maxTreeEntries).</div> : null}
        {roots == null ? (
          <div className="cb-placeholder">loading tree…</div>
        ) : (
          <TreeProvider
            multiSelect={false}
            onExpandedChange={onExpandedChange}
            onSelectionChange={onSelectionChange}
            selectedIds={selected}
            showLines
          >
            <TreeView>
              {roots.map((n, i) => renderNode(n, 0, i === roots.length - 1, []))}
            </TreeView>
          </TreeProvider>
        )}
      </aside>
      <section className="cb-content">{viewer}</section>
    </div>
  );
}

const rootEl = document.getElementById('sdlc-code-root');
if (rootEl) {
  const base = rootEl.getAttribute('data-base') ?? '/__code';
  createRoot(rootEl).render(
    <StrictMode>
      <App base={base} />
    </StrictMode>,
  );
}

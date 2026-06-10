// view-src/code-browser/components/code-block.tsx
//
// VENDORED from kibo-ui `code-block` (https://www.kibo-ui.com/components/code-block,
// registry item fetched 2026-06-10), adapted per CODEBASE-BROWSER-PLAN §0.2-8.
// Upstream composition preserved (CodeBlock/CodeBlockHeader/CodeBlockFilename/
// CodeBlockCopyButton/CodeBlockBody/CodeBlockItem/CodeBlockContent) including
// the counter-based line numbers. Deviations:
//   • full-bundle `shiki` `codeToHtml` → the fine-grained no-WASM highlighter
//     (../highlighter, single warm-paper theme) — the decisive bundle-size win.
//   • `react-icons` (60+ brand icons), `@shikijs/transformers` (notation
//     annotations for authored docs), radix `useControllableState`, and the
//     shadcn Button/Select REMOVED — a read-only single-file viewer needs none
//     of them; the copy button is a plain <button>.
//   • dark-mode dual-theme classes dropped (the view is warm-paper light).

import { Check, Copy } from 'lucide-react';
import {
  type HTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { highlight } from '../highlighter';
import { cn } from '../lib/cn';

export type CodeBlockData = {
  language: string;
  filename: string;
  code: string;
};

type CodeBlockContextType = {
  value: string | undefined;
  data: CodeBlockData[];
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  value: undefined,
  data: [],
});

// Upstream's counter-based line numbers, verbatim.
const lineNumberClassNames = cn(
  '[&_code]:[counter-reset:line]',
  '[&_code]:[counter-increment:line_0]',
  '[&_.line]:before:content-[counter(line)]',
  '[&_.line]:before:inline-block',
  '[&_.line]:before:[counter-increment:line]',
  '[&_.line]:before:w-8',
  '[&_.line]:before:mr-4',
  '[&_.line]:before:text-[12px]',
  '[&_.line]:before:text-right',
  '[&_.line]:before:text-muted-foreground/50',
  '[&_.line]:before:font-mono',
  '[&_.line]:before:select-none',
);

const codeBlockClassName = cn(
  'mt-0 bg-background text-sm',
  '[&_pre]:py-4',
  '[&_.shiki]:!bg-transparent',
  '[&_code]:w-full',
  '[&_code]:grid',
  '[&_code]:overflow-x-auto',
  '[&_code]:bg-transparent',
  '[&_.line]:px-4',
  '[&_.line]:w-full',
  '[&_.line]:relative',
);

export type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  value?: string;
  data: CodeBlockData[];
};

export const CodeBlock = ({ value, className, data, ...props }: CodeBlockProps) => (
  <CodeBlockContext.Provider value={{ value, data }}>
    <div
      className={cn('size-full overflow-hidden rounded-md border', className)}
      {...props}
    />
  </CodeBlockContext.Provider>
);

export type CodeBlockHeaderProps = HTMLAttributes<HTMLDivElement>;

export const CodeBlockHeader = ({ className, ...props }: CodeBlockHeaderProps) => (
  <div
    className={cn('flex flex-row items-center gap-2 border-b bg-secondary px-3 py-1.5', className)}
    {...props}
  />
);

export type CodeBlockFilenameProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode;
};

export const CodeBlockFilename = ({
  className,
  icon,
  children,
  ...props
}: CodeBlockFilenameProps) => (
  <div
    className={cn('flex grow items-center gap-2 font-mono text-[13px] text-muted-foreground', className)}
    {...props}
  >
    {icon}
    <span className="flex-1 truncate">{children}</span>
  </div>
);

export type CodeBlockCopyButtonProps = HTMLAttributes<HTMLButtonElement> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  className,
  onCopy,
  onError,
  timeout = 2000,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { value, data } = useContext(CodeBlockContext);
  const code = data.find((item) => item.filename === value)?.code ?? data[0]?.code;

  const copyToClipboard = () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText || code == null) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }
    navigator.clipboard.writeText(code).then(() => {
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    }, (err) => onError?.(err));
  };

  return (
    <button
      type="button"
      aria-label="Copy file contents"
      className={cn(
        'flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md',
        'text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
        className,
      )}
      onClick={copyToClipboard}
      {...props}
    >
      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export type CodeBlockBodyProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (item: CodeBlockData) => ReactNode;
};

export const CodeBlockBody = ({ className, children, ...props }: CodeBlockBodyProps) => {
  const { data } = useContext(CodeBlockContext);
  return (
    <div className={cn('min-h-0 flex-1 overflow-auto', className)} {...props}>
      {data.map(children)}
    </div>
  );
};

export type CodeBlockItemProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
  lineNumbers?: boolean;
};

export const CodeBlockItem = ({
  children,
  lineNumbers = true,
  className,
  value,
  ...props
}: CodeBlockItemProps) => {
  const { value: activeValue } = useContext(CodeBlockContext);
  if (value !== activeValue) {
    return null;
  }
  return (
    <div
      className={cn(codeBlockClassName, lineNumbers && lineNumberClassNames, className)}
      {...props}
    >
      {children}
    </div>
  );
};

export type CodeBlockContentProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
};

export const CodeBlockContent = ({ code, language, className, ...props }: CodeBlockContentProps) => {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    highlight(code, language).then(
      (out) => { if (alive) setHtml(out); },
      () => { if (alive) setHtml(null); },
    );
    return () => { alive = false; };
  }, [code, language]);

  if (html == null) {
    // Pre-highlight (or highlight-failed) fallback: same layout, no tokens.
    return (
      <div className={className} {...props}>
        <pre className="shiki"><code>{code.split('\n').map((line, i) => (
          <span className="line" key={i}>{line}{'\n'}</span>
        ))}</code></pre>
      </div>
    );
  }

  return (
    // Server-fetched repo text, highlighted client-side by Shiki, which
    // HTML-escapes token content — no untrusted markup reaches innerHTML.
    <div
      className={className}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
      {...props}
    />
  );
};

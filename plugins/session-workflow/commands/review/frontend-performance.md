---
name: review:frontend-performance
description: Review frontend changes for bundle size, rendering efficiency, and user-perceived latency
usage: /review:frontend-performance [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/components/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: framework (React/Vue/Angular), bundle tooling (Webpack/Vite/Rollup), performance goals (LCP, FID, CLS)'
    required: false
examples:
  - command: /review:frontend-performance pr 123
    description: Review PR #123 for frontend performance issues
  - command: /review:frontend-performance worktree "src/components/**"
    description: Review component changes for rendering performance
  - command: /review:frontend-performance diff main..feature "CONTEXT: React 18, Vite, target LCP < 2.5s"
    description: Review branch diff with performance requirements
---

# Frontend Performance Review

You are a frontend performance reviewer focusing on user-perceived latency, bundle size, rendering efficiency, and network waterfalls.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed frontend files in the specified PR
- **`worktree`**: Review uncommitted frontend changes
- **`diff`**: Review diff between two refs
- **`file`**: Review specific frontend file(s)
- **`repo`**: Review all frontend components

If `PATHS` is provided, filter to matching frontend files.

## Step 2: Extract Frontend Code

For each file in scope:

1. **Identify frontend-specific code**:
   - Component render functions
   - Data fetching patterns (useEffect, React Query, SWR)
   - Bundle imports (especially large libraries)
   - Images and assets
   - CSS-in-JS and styling
   - State management (Redux, Zustand, Context)

2. **Read full component** (not just diff)

3. **Check for performance patterns**:
   - Unnecessary re-renders
   - Missing memoization
   - Heavy computations in render
   - Large bundle imports
   - Blocking data fetching
   - Unoptimized images

**Critical**: Always read the **complete component** to understand full performance impact.

## Step 3: Parse CONTEXT (if provided)

Extract performance requirements from `CONTEXT` parameter:

- **Framework**: React, Vue, Angular, Svelte (affects patterns)
- **Build tool**: Webpack, Vite, Rollup, esbuild
- **Performance goals**:
  - LCP (Largest Contentful Paint) < 2.5s
  - FID (First Input Delay) < 100ms
  - CLS (Cumulative Layout Shift) < 0.1
  - Bundle size budget (e.g., < 200KB gzipped)
- **Target devices**: Mobile, desktop, low-end devices

Example:
```
CONTEXT: React 18, Vite, target LCP < 2.5s, FID < 100ms, mobile-first
```

## Step 4: Frontend Performance Checklist Review

For each component, systematically check:

### 4.1 Bundle Size
- [ ] Large dependencies imported unnecessarily?
- [ ] Tree-shaking working properly (named imports)?
- [ ] Code splitting and lazy loading for routes?
- [ ] Duplicate libraries in bundle?
- [ ] Heavy polyfills for modern browsers?
- [ ] Unused code included?

**Red flags:**
- `import _ from 'lodash'` (imports entire 70KB library)
- `import moment from 'moment'` (imports entire 67KB library)
- No route-based code splitting
- Multiple date libraries (moment, date-fns, dayjs)
- Importing dev-only libraries in production

**Bundle examples:**
```jsx
// ❌ BAD: Imports entire lodash (70KB)
import _ from 'lodash';

function MyComponent() {
  const uniqueItems = _.uniq(items);
  return <div>{uniqueItems.length}</div>;
}

// ✅ GOOD: Tree-shakeable named import (<1KB)
import { uniq } from 'lodash-es';

function MyComponent() {
  const uniqueItems = uniq(items);
  return <div>{uniqueItems.length}</div>;
}

// ✅ BETTER: Native JavaScript (0KB)
function MyComponent() {
  const uniqueItems = [...new Set(items)];
  return <div>{uniqueItems.length}</div>;
}

// ❌ BAD: Heavy date library (67KB)
import moment from 'moment';

function formatDate(date) {
  return moment(date).format('YYYY-MM-DD');
}

// ✅ GOOD: Lightweight alternative (2KB)
import { format } from 'date-fns';

function formatDate(date) {
  return format(date, 'yyyy-MM-dd');
}

// ✅ BETTER: Native Intl API (0KB)
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US').format(date);
}

// ❌ BAD: No code splitting
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

<Routes>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/settings" element={<Settings />} />
  <Route path="/profile" element={<Profile />} />
</Routes>

// Initial bundle: 500KB (includes all pages)

// ✅ GOOD: Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));

<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/profile" element={<Profile />} />
  </Routes>
</Suspense>

// Initial bundle: 150KB (lazy loads pages on demand)
```

### 4.2 Rendering Performance
- [ ] Unnecessary re-renders (unstable deps, inline objects)?
- [ ] Missing React.memo or useMemo for expensive computations?
- [ ] Missing useCallback for functions passed to children?
- [ ] Expensive operations in render function?
- [ ] Large lists without virtualization?
- [ ] Context causing wide re-renders?

**Red flags:**
- Inline object/array literals in JSX
- Expensive computations without useMemo
- Functions defined inside render
- Rendering 1000+ items without virtualization
- Context value changing on every render

**Rendering examples:**
```jsx
// ❌ BAD: Inline object causes re-render every time
function Parent() {
  return <Child style={{ margin: 10 }} />;  // New object every render
}

const Child = memo(({ style }) => {
  console.log('Child rendered');
  return <div style={style}>Child</div>;
});

// Parent re-renders → Child re-renders (style object changed)

// ✅ GOOD: Stable object reference
const childStyle = { margin: 10 };

function Parent() {
  return <Child style={childStyle} />;
}

// Parent re-renders → Child does NOT re-render (style unchanged)

// ❌ BAD: Expensive computation on every render
function UserList({ users }) {
  const sortedUsers = users
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));  // Runs every render!

  return sortedUsers.map(user => <UserCard key={user.id} user={user} />);
}

// ✅ GOOD: Memoized computation
function UserList({ users }) {
  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  return sortedUsers.map(user => <UserCard key={user.id} user={user} />);
}

// ❌ BAD: Function recreated every render
function Parent() {
  const handleClick = () => {  // New function every render
    console.log('Clicked');
  };

  return <ExpensiveChild onClick={handleClick} />;
}

// Parent re-renders → ExpensiveChild re-renders (onClick changed)

// ✅ GOOD: Stable function reference
function Parent() {
  const handleClick = useCallback(() => {
    console.log('Clicked');
  }, []);

  return <ExpensiveChild onClick={handleClick} />;
}

// Parent re-renders → ExpensiveChild does NOT re-render

// ❌ BAD: Context causing wide re-renders
const UserContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('dark');

  return (
    <UserContext.Provider value={{ user, setUser, theme, setTheme }}>
      {/* Every component using UserContext re-renders when theme changes! */}
      <Dashboard />
    </UserContext.Provider>
  );
}

// ✅ GOOD: Split contexts
const UserContext = createContext();
const ThemeContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState('dark');

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <Dashboard />
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
}

// Now theme changes only affect ThemeContext consumers
```

### 4.3 Data Fetching
- [ ] Sequential fetches causing waterfalls?
- [ ] Missing caching/revalidation strategies?
- [ ] Fetching same data multiple times?
- [ ] Large payload sizes?
- [ ] Missing pagination for large datasets?
- [ ] Blocking render for data?

**Red flags:**
- Multiple useEffect with fetch causing waterfall
- Fetch-on-render pattern without Suspense
- No cache headers or stale-while-revalidate
- Fetching entire dataset instead of paginating
- Refetching on every component mount

**Data fetching examples:**
```jsx
// ❌ BAD: Sequential waterfall
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(setUser);
  }, [userId]);

  useEffect(() => {
    if (user) {  // ❌ Waits for user to load
      fetch(`/api/users/${user.id}/posts`)
        .then(res => res.json())
        .then(setPosts);
    }
  }, [user]);

  // Timeline:
  // 0ms: Start fetching user
  // 200ms: User loaded, start fetching posts
  // 400ms: Posts loaded
  // Total: 400ms (sequential)
}

// ✅ GOOD: Parallel fetching
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/users/${userId}`).then(res => res.json()),
      fetch(`/api/users/${userId}/posts`).then(res => res.json())
    ]).then(([userData, postsData]) => {
      setUser(userData);
      setPosts(postsData);
    });
  }, [userId]);

  // Timeline:
  // 0ms: Start fetching user AND posts
  // 200ms: Both loaded
  // Total: 200ms (parallel)
}

// ✅ BETTER: Use React Query for caching
function UserProfile({ userId }) {
  const { data: user } = useQuery(['user', userId], () =>
    fetch(`/api/users/${userId}`).then(res => res.json())
  );

  const { data: posts } = useQuery(['posts', userId], () =>
    fetch(`/api/users/${userId}/posts`).then(res => res.json())
  );

  // Automatic caching, deduplication, background refetch
}

// ❌ BAD: Fetching entire dataset
function UserList() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetch('/api/users')  // ❌ Returns 10,000 users (5MB payload)
      .then(res => res.json())
      .then(setUsers);
  }, []);

  return users.map(user => <UserCard key={user.id} user={user} />);
}

// ✅ GOOD: Paginated fetching
function UserList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery(['users', page], () =>
    fetch(`/api/users?page=${page}&limit=20`)  // ✅ 20 users (50KB payload)
      .then(res => res.json())
  );

  return (
    <>
      {data?.users.map(user => <UserCard key={user.id} user={user} />)}
      <Pagination page={page} onPageChange={setPage} />
    </>
  );
}

// ❌ BAD: Refetch on every mount
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)  // ❌ Fetches every time component mounts
      .then(res => res.json())
      .then(setUser);
  }, [userId]);
}

// Navigate away and back → refetches unnecessarily

// ✅ GOOD: Cache with React Query
function UserProfile({ userId }) {
  const { data: user } = useQuery(
    ['user', userId],
    () => fetch(`/api/users/${userId}`).then(res => res.json()),
    {
      staleTime: 5 * 60 * 1000,  // ✅ Cache for 5 minutes
      cacheTime: 10 * 60 * 1000   // ✅ Keep in memory for 10 minutes
    }
  );
}

// Navigate away and back → uses cached data (no refetch)
```

### 4.4 Images and Assets
- [ ] Unoptimized images (no compression)?
- [ ] Missing responsive images (srcset)?
- [ ] No lazy loading for below-fold images?
- [ ] Wrong image formats (use WebP/AVIF)?
- [ ] Loading spinner images synchronously?
- [ ] Missing width/height causing CLS?

**Red flags:**
- Large PNG/JPEG images (>100KB)
- No `loading="lazy"` on below-fold images
- No `width` and `height` attributes
- Not using modern formats (WebP, AVIF)
- Inline base64 images in bundle

**Image examples:**
```jsx
// ❌ BAD: Unoptimized, large image
<img
  src="/images/hero.jpg"  // ❌ 2MB original JPEG
  alt="Hero"
/>

// Problems:
// - Large file size (2MB)
// - No responsive sizes
// - No lazy loading
// - Causes layout shift (no dimensions)

// ✅ GOOD: Optimized, responsive, lazy
<img
  src="/images/hero-800w.webp"
  srcSet="
    /images/hero-400w.webp 400w,
    /images/hero-800w.webp 800w,
    /images/hero-1200w.webp 1200w
  "
  sizes="(max-width: 768px) 100vw, 800px"
  alt="Hero"
  width={800}
  height={600}
  loading="lazy"
/>

// ✅ Next.js Image component (automatic optimization)
import Image from 'next/image';

<Image
  src="/images/hero.jpg"
  alt="Hero"
  width={800}
  height={600}
  priority={false}  // Lazy load by default
/>

// ❌ BAD: Loading all images eagerly
function Gallery({ images }) {
  return (
    <div>
      {images.map(img => (
        <img key={img.id} src={img.url} alt={img.alt} />
      ))}
    </div>
  );
}

// All 50 images load immediately (50MB total)

// ✅ GOOD: Lazy load below-fold images
function Gallery({ images }) {
  return (
    <div>
      {images.map((img, index) => (
        <img
          key={img.id}
          src={img.url}
          alt={img.alt}
          loading={index < 3 ? 'eager' : 'lazy'}  // First 3 eager, rest lazy
        />
      ))}
    </div>
  );
}

// ❌ BAD: No dimensions causing layout shift
<img src="/avatar.jpg" alt="Avatar" />

// Image loads → page jumps (CLS score increases)

// ✅ GOOD: Fixed dimensions prevent layout shift
<img
  src="/avatar.jpg"
  alt="Avatar"
  width={64}
  height={64}
  style={{ aspectRatio: '1/1' }}
/>

// ❌ BAD: Inline base64 in bundle
const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';  // 50KB

function Header() {
  return <img src={logo} alt="Logo" />;
}

// ✅ GOOD: External image asset
import logo from './logo.png';  // Handled by bundler

function Header() {
  return <img src={logo} alt="Logo" />;
}
```

### 4.5 Main Thread Performance
- [ ] Long tasks blocking main thread (>50ms)?
- [ ] Heavy JavaScript execution in hot paths?
- [ ] JSON.parse of large payloads?
- [ ] Synchronous operations (localStorage reads)?
- [ ] Heavy regex or string operations?
- [ ] Missing requestIdleCallback for non-urgent work?

**Red flags:**
- Synchronous JSON.parse of >1MB payload
- Heavy computations not in web workers
- Reading localStorage in render path
- Complex regex on large strings
- No time-slicing for expensive operations

**Main thread examples:**
```jsx
// ❌ BAD: Blocking JSON.parse in render
function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.text())
      .then(text => {
        const json = JSON.parse(text);  // ❌ Blocks main thread (5MB JSON)
        setData(json);
      });
  }, []);
}

// Main thread blocked for 200ms while parsing

// ✅ GOOD: Parse in worker or use streaming
function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(res => res.json())  // ✅ Browser handles parsing efficiently
      .then(setData);
  }, []);
}

// ❌ BAD: Heavy computation in render
function SearchResults({ items, query }) {
  const filtered = items.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) &&
    item.tags.some(tag => tag.includes(query))
  );  // ❌ Runs on every render (10,000 items)

  return filtered.map(item => <ResultCard key={item.id} item={item} />);
}

// ✅ GOOD: Memoize expensive computation
function SearchResults({ items, query }) {
  const filtered = useMemo(
    () => items.filter(item =>
      item.title.toLowerCase().includes(query.toLowerCase()) &&
      item.tags.some(tag => tag.includes(query))
    ),
    [items, query]
  );

  return filtered.map(item => <ResultCard key={item.id} item={item} />);
}

// ✅ BETTER: Debounce search + time-slice filtering
function SearchResults({ items, query }) {
  const [filtered, setFiltered] = useState([]);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    let cancelled = false;

    // Time-slice filtering to avoid blocking
    const chunks = chunkArray(items, 100);
    const results = [];

    function processChunk(index) {
      if (cancelled || index >= chunks.length) {
        if (!cancelled) setFiltered(results);
        return;
      }

      const chunk = chunks[index];
      const filtered = chunk.filter(item =>
        item.title.toLowerCase().includes(debouncedQuery.toLowerCase())
      );
      results.push(...filtered);

      requestIdleCallback(() => processChunk(index + 1));
    }

    processChunk(0);

    return () => { cancelled = true; };
  }, [items, debouncedQuery]);

  return filtered.map(item => <ResultCard key={item.id} item={item} />);
}

// ❌ BAD: Synchronous localStorage in render path
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';  // ❌ Blocks render
  });

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

// ✅ GOOD: Async localStorage read
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setTheme(savedTheme);
  }, []);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

### 4.6 State Management
- [ ] Global state causing unnecessary re-renders?
- [ ] Derived state not memoized?
- [ ] State updates in loops?
- [ ] Too much data in context?
- [ ] Selectors not memoized (Redux)?

**Red flags:**
- Large objects in React Context
- Redux selectors without reselect
- Storing entire API response in state
- Updating state in loops
- Context value changing on every render

**State management examples:**
```jsx
// ❌ BAD: Large object in context
const AppContext = createContext();

function App() {
  const [state, setState] = useState({
    user: { /* ... */ },
    posts: [/* 1000 posts */],
    comments: [/* 5000 comments */],
    theme: 'dark',
    settings: { /* ... */ }
  });

  return (
    <AppContext.Provider value={state}>
      {/* Every state change re-renders EVERYTHING */}
      <Dashboard />
    </AppContext.Provider>
  );
}

// ✅ GOOD: Split contexts by update frequency
const UserContext = createContext();
const PostsContext = createContext();
const ThemeContext = createContext();

function App() {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [theme, setTheme] = useState('dark');

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <PostsContext.Provider value={{ posts, setPosts }}>
        <ThemeContext.Provider value={{ theme, setTheme }}>
          <Dashboard />
        </ThemeContext.Provider>
      </PostsContext.Provider>
    </UserContext.Provider>
  );
}

// ❌ BAD: Redux selector not memoized
function UserList() {
  const users = useSelector(state =>
    state.users.filter(u => u.active)  // ❌ New array every time
  );

  return users.map(user => <UserCard key={user.id} user={user} />);
}

// Component re-renders even when users haven't changed

// ✅ GOOD: Memoized selector
import { createSelector } from 'reselect';

const selectActiveUsers = createSelector(
  state => state.users,
  users => users.filter(u => u.active)
);

function UserList() {
  const users = useSelector(selectActiveUsers);  // ✅ Memoized

  return users.map(user => <UserCard key={user.id} user={user} />);
}

// ❌ BAD: State updates in loop
function BulkUpdate({ items }) {
  const [status, setStatus] = useState({});

  async function updateAll() {
    for (const item of items) {
      await updateItem(item.id);
      setStatus(prev => ({ ...prev, [item.id]: 'done' }));  // ❌ Re-render per item
    }
  }
}

// 100 items → 100 re-renders

// ✅ GOOD: Batch state updates
function BulkUpdate({ items }) {
  const [status, setStatus] = useState({});

  async function updateAll() {
    const updates = await Promise.all(
      items.map(item => updateItem(item.id))
    );

    setStatus(prev => {
      const newStatus = { ...prev };
      items.forEach((item, i) => {
        newStatus[item.id] = 'done';
      });
      return newStatus;
    });  // ✅ Single re-render
  }
}
```

### 4.7 SSR/Hydration (if applicable)
- [ ] Hydration mismatches?
- [ ] Heavy client-side JavaScript after SSR?
- [ ] Missing streaming for large pages?
- [ ] Blocking hydration?
- [ ] Server components not utilized (Next.js 13+)?

**Red flags:**
- Different content between server and client
- Large bundle needed for hydration
- No progressive hydration
- Fetching data after SSR

## Step 5: Generate Findings

For each performance issue discovered:

**Finding format:**
```
## FP-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: BLOCKER | HIGH | MED | LOW | NIT
**Confidence**: 95% | 80% | 60%
**Impact**: {Bundle size / Rendering / Loading time}

### Evidence
{Code snippet showing the issue}

### Issue
{Description of performance problem and user impact}

### Remediation
{Before and after code with explanation}

### Metrics
{Estimated performance improvement}
```

**Severity guidelines:**
- **BLOCKER**: Major performance regression (>500ms delay, >200KB bundle increase)
- **HIGH**: Significant impact (>200ms delay, >100KB bundle increase)
- **MED**: Noticeable impact (>100ms delay, >50KB bundle increase)
- **LOW**: Minor impact (<100ms delay, <50KB bundle increase)
- **NIT**: Best practice (measurable but small impact)

**Confidence guidelines:**
- **95%+**: Clear performance issue (measured with profiler)
- **80%**: Likely performance issue (known anti-pattern)
- **60%**: Potential issue (context-dependent)

## Step 6: Cross-Reference with Patterns

Check if issues match known patterns:

1. **Bundle bloat pattern**: Large library imports without tree-shaking
2. **Render thrashing pattern**: Unstable deps causing re-render loops
3. **Waterfall pattern**: Sequential fetches instead of parallel
4. **Memory leak pattern**: Missing cleanup in useEffect
5. **Layout shift pattern**: Missing image dimensions
6. **Blocking main thread pattern**: Heavy synchronous operations
7. **Over-fetching pattern**: Loading entire datasets instead of pagination

## Step 7: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/frontend-performance_<timestamp>.md`:

```markdown
# Frontend Performance Review Report

**Session**: <SESSION_SLUG>
**Scope**: <SCOPE>
**Target**: <TARGET>
**Date**: <YYYY-MM-DD>
**Reviewer**: Claude (Frontend Performance Specialist)

## 0) Scope & Performance Goals

- **Framework**: {React/Vue/Angular}
- **Build tool**: {Webpack/Vite/Rollup}
- **Performance targets**:
  - LCP: < 2.5s
  - FID: < 100ms
  - CLS: < 0.1
  - Bundle size: < 200KB gzipped
- **Files reviewed**: {count}

## 1) Performance Issues (ranked by impact)

{List all findings with severity}

## 2) Critical Performance Blockers

{BLOCKER severity findings that cause major regressions}

## 3) Measurement Recommendations

### Bundle Analysis
```bash
# Webpack Bundle Analyzer
npm install --save-dev webpack-bundle-analyzer
npx webpack-bundle-analyzer dist/stats.json

# Vite bundle analysis
npm run build -- --mode analyze

# Check bundle size
npx bundlesize
```

### Runtime Performance
```bash
# Lighthouse
npx lighthouse https://localhost:3000 --view

# Web Vitals
npm install web-vitals
```

```jsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

### React Profiler
```jsx
import { Profiler } from 'react';

<Profiler id="Dashboard" onRender={(id, phase, duration) => {
  console.log(`${id} (${phase}) took ${duration}ms`);
}}>
  <Dashboard />
</Profiler>
```

## 4) Performance Budget

| Metric | Budget | Current | Status |
|--------|--------|---------|--------|
| Initial bundle | 200KB | 350KB | ❌ FAIL (+75%) |
| LCP | 2.5s | 3.8s | ❌ FAIL (+52%) |
| FID | 100ms | 45ms | ✅ PASS |
| CLS | 0.1 | 0.15 | ⚠️ WARN (+50%) |

## 5) Non-Negotiables

1. **Route-based code splitting** for all pages
2. **Lazy load below-fold images** with `loading="lazy"`
3. **No large library imports** without tree-shaking (lodash, moment)
4. **Memoize expensive computations** in hot paths
5. **Parallel data fetching** instead of waterfalls

## 6) Summary Statistics

- **Total issues**: {count}
- **BLOCKER**: {count}
- **HIGH**: {count}
- **MED**: {count}
- **Bundle size impact**: +{X}KB
- **Est. performance impact**: +{Y}ms

---

{Detailed findings follow below}
```

## Step 8: Output Summary

Output to user:
```
✅ Frontend performance review complete

📊 Summary:
- Files reviewed: {count}
- Issues found: {count}
- BLOCKER: {count}
- HIGH: {count}
- Bundle impact: +{X}KB

📝 Report: .claude/<SESSION_SLUG>/reviews/frontend-performance_<timestamp>.md

⚠️ Critical performance blockers:
{List BLOCKER findings}

💡 Next steps:
1. Run bundle analyzer to visualize size impact
2. Measure with Lighthouse (target: 90+ score)
3. Profile with React DevTools
4. Test on low-end devices (throttled)
```

## Step 9: Example Findings

Below are realistic examples following the finding format:

---

### Example Finding 1: Large Library Import Without Tree-Shaking

```markdown
## FP-1: Importing entire lodash library instead of individual functions

**File**: src/utils/helpers.ts:3
**Severity**: HIGH
**Confidence**: 95%
**Impact**: Bundle size +68KB gzipped

### Evidence
```typescript
// src/utils/helpers.ts:3-8
import _ from 'lodash';

export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
  return _.uniqBy(arr, key);
}

export function sortBy<T>(arr: T[], key: keyof T): T[] {
  return _.sortBy(arr, key);
}
```

### Issue
The code imports the entire lodash library (280KB uncompressed, 68KB gzipped) but only uses two functions: `uniqBy` and `sortBy`. This is a common tree-shaking failure with default lodash imports.

**Bundle impact**:
- Current: 280KB lodash (68KB gzipped)
- Needed: ~5KB for two functions (<2KB gzipped)
- Waste: **66KB gzipped** (97% of the import is unused)

**User impact**: Initial bundle increased by 66KB, adding ~660ms to load time on 3G connection (100KB/s).

**Testing**: Run webpack-bundle-analyzer and see lodash as largest dependency.

### Remediation

**BEFORE**:
```typescript
import _ from 'lodash';

export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
  return _.uniqBy(arr, key);
}

export function sortBy<T>(arr: T[], key: keyof T): T[] {
  return _.sortBy(arr, key);
}
```

**AFTER** (Option 1: Tree-shakeable imports):
```typescript
import { uniqBy, sortBy } from 'lodash-es';

export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
  return uniqBy(arr, key);
}

export function sortBy<T>(arr: T[], key: keyof T): T[] {
  return sortBy(arr, key);
}
```

**Bundle impact**: 280KB → 5KB (98% reduction)

**AFTER** (Option 2: Native JavaScript):
```typescript
export function uniqueBy<T>(arr: T[], key: keyof T): T[] {
  const seen = new Set();
  return arr.filter(item => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

export function sortBy<T>(arr: T[], key: keyof T): T[] {
  return arr.slice().sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
  });
}
```

**Bundle impact**: 280KB → 0KB (100% reduction, native code)

**Changes**:
1. ✅ Replace `import _ from 'lodash'` with `import { uniqBy } from 'lodash-es'`
2. ✅ Enable tree-shaking in webpack/vite config
3. ✅ Or use native JavaScript implementations (best)

**Verification**:
```bash
# Before
npm run build
# Bundle: 350KB gzipped

# After
npm run build
# Bundle: 284KB gzipped (-66KB)

# Lighthouse score improvement: 72 → 84
```

### Metrics
- **Bundle size**: -66KB gzipped (-19%)
- **Load time (3G)**: -660ms
- **Lighthouse score**: +12 points
- **First Contentful Paint**: -200ms
```

---

### Example Finding 2: Component Re-rendering on Every Parent Update

```markdown
## FP-2: Expensive component re-rendering due to unstable props

**File**: src/components/Dashboard.tsx:45
**Severity**: HIGH
**Confidence**: 95%
**Impact**: Rendering performance (50ms per render, 20 renders/sec)

### Evidence
```tsx
// src/components/Dashboard.tsx:45-58
function Dashboard() {
  const [stats, setStats] = useState({ users: 0, revenue: 0 });

  return (
    <div>
      <StatsCard
        data={stats}
        onRefresh={() => fetchStats().then(setStats)}  // ❌ New function every render
        style={{ padding: 20 }}  // ❌ New object every render
      />
    </div>
  );
}

const StatsCard = memo(({ data, onRefresh, style }) => {
  console.log('StatsCard rendered');
  // Expensive chart rendering (50ms)
  return <Chart data={data} style={style} />;
});
```

### Issue
The `StatsCard` component is wrapped in `React.memo` but still re-renders on every parent update because:

1. **Inline function**: `onRefresh={() => ...}` creates a new function reference every render
2. **Inline object**: `style={{ padding: 20 }}` creates a new object every render

Even though `React.memo` is used, the props change every render, defeating the memoization.

**Performance impact**:
- Parent re-renders: 20/sec (typing in search field)
- StatsCard re-renders: 20/sec (unnecessary)
- Each render: 50ms (expensive chart)
- **Total blocked time**: 1,000ms/sec = 100% main thread blocked

**User impact**: UI feels laggy and unresponsive during interactions. Typing in search field causes dropped frames.

**Testing**: Open React DevTools Profiler and see StatsCard highlighted on every keystroke.

### Remediation

**BEFORE**:
```tsx
function Dashboard() {
  const [stats, setStats] = useState({ users: 0, revenue: 0 });

  return (
    <div>
      <StatsCard
        data={stats}
        onRefresh={() => fetchStats().then(setStats)}
        style={{ padding: 20 }}
      />
    </div>
  );
}

const StatsCard = memo(({ data, onRefresh, style }) => {
  console.log('StatsCard rendered');
  return <Chart data={data} style={style} />;
});
```

**AFTER**:
```tsx
const cardStyle = { padding: 20 };  // ✅ Stable object outside component

function Dashboard() {
  const [stats, setStats] = useState({ users: 0, revenue: 0 });

  const handleRefresh = useCallback(() => {  // ✅ Stable function
    fetchStats().then(setStats);
  }, []);

  return (
    <div>
      <StatsCard
        data={stats}
        onRefresh={handleRefresh}
        style={cardStyle}
      />
    </div>
  );
}

const StatsCard = memo(({ data, onRefresh, style }) => {
  console.log('StatsCard rendered');
  return <Chart data={data} style={style} />;
});
```

**Changes**:
1. ✅ Move `style` object outside component (stable reference)
2. ✅ Wrap `onRefresh` in `useCallback` (stable function)
3. ✅ Now `StatsCard` only re-renders when `data` changes

**Verification with React DevTools Profiler**:
```
// Before
Dashboard renders: 20/sec
StatsCard renders: 20/sec (100% unnecessary)
Blocked time: 1,000ms/sec

// After
Dashboard renders: 20/sec
StatsCard renders: 0.1/sec (only when data updates)
Blocked time: 5ms/sec (99.5% reduction)
```

### Metrics
- **Re-renders eliminated**: 99.5%
- **Main thread time saved**: 995ms/sec
- **Frame rate**: 15 FPS → 60 FPS
- **Interaction latency**: 200ms → 5ms
```

---

### Example Finding 3: Sequential Data Fetching Waterfall

```markdown
## FP-3: Sequential API calls creating network waterfall

**File**: src/pages/UserProfile.tsx:23
**Severity**: HIGH
**Confidence**: 95%
**Impact**: Loading time +600ms

### Evidence
```tsx
// src/pages/UserProfile.tsx:23-45
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(setUser);
  }, [userId]);

  useEffect(() => {
    if (user) {  // ❌ Waits for user
      fetch(`/api/users/${user.id}/posts`)
        .then(res => res.json())
        .then(setPosts);
    }
  }, [user]);

  useEffect(() => {
    if (posts) {  // ❌ Waits for posts
      fetch(`/api/posts/${posts[0]?.id}/comments`)
        .then(res => res.json())
        .then(setComments);
    }
  }, [posts]);

  if (!user || !posts || !comments) return <Loading />;

  return <ProfileView user={user} posts={posts} comments={comments} />;
}
```

### Issue
The component fetches data sequentially in a waterfall pattern:

**Timeline**:
```
0ms: Start fetching user
200ms: User loaded → Start fetching posts
400ms: Posts loaded → Start fetching comments
600ms: Comments loaded → Render content
Total: 600ms
```

This is unnecessary because:
1. Posts can be fetched in parallel with user (both need `userId`)
2. Comments could be fetched in parallel if we know the post ID upfront

**User impact**: User sees loading spinner for 600ms instead of 200ms. This is a 3x slowdown.

**Testing**: Open Network tab and see requests made sequentially, not in parallel.

### Remediation

**BEFORE**:
```tsx
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then(res => res.json())
      .then(setUser);
  }, [userId]);

  useEffect(() => {
    if (user) {
      fetch(`/api/users/${user.id}/posts`)
        .then(res => res.json())
        .then(setPosts);
    }
  }, [user]);

  useEffect(() => {
    if (posts) {
      fetch(`/api/posts/${posts[0]?.id}/comments`)
        .then(res => res.json())
        .then(setComments);
    }
  }, [posts]);

  if (!user || !posts || !comments) return <Loading />;

  return <ProfileView user={user} posts={posts} comments={comments} />;
}
```

**AFTER** (Parallel fetching):
```tsx
function UserProfile({ userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // ✅ Fetch in parallel
    Promise.all([
      fetch(`/api/users/${userId}`).then(res => res.json()),
      fetch(`/api/users/${userId}/posts`).then(res => res.json())
    ]).then(async ([user, posts]) => {
      // Fetch comments for first post (still depends on posts)
      const comments = await fetch(`/api/posts/${posts[0]?.id}/comments`)
        .then(res => res.json());

      if (!cancelled) {
        setData({ user, posts, comments });
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return <Loading />;

  return <ProfileView {...data} />;
}
```

**Timeline after fix**:
```
0ms: Start fetching user AND posts (parallel)
200ms: Both loaded → Start fetching comments
400ms: Comments loaded → Render content
Total: 400ms (-200ms, 33% faster)
```

**BETTER** (Using React Query for caching):
```tsx
function UserProfile({ userId }) {
  const { data: user, isLoading: userLoading } = useQuery(
    ['user', userId],
    () => fetch(`/api/users/${userId}`).then(res => res.json())
  );

  const { data: posts, isLoading: postsLoading } = useQuery(
    ['posts', userId],
    () => fetch(`/api/users/${userId}/posts`).then(res => res.json())
  );

  const { data: comments, isLoading: commentsLoading } = useQuery(
    ['comments', posts?.[0]?.id],
    () => fetch(`/api/posts/${posts[0].id}/comments`).then(res => res.json()),
    { enabled: !!posts?.[0]?.id }
  );

  if (userLoading || postsLoading || commentsLoading) return <Loading />;

  return <ProfileView user={user} posts={posts} comments={comments} />;
}
```

**Benefits**:
- ✅ Parallel fetching (user + posts)
- ✅ Automatic caching and deduplication
- ✅ Background refetch on window focus
- ✅ Stale-while-revalidate strategy

### Metrics
- **Load time**: 600ms → 400ms (-33%)
- **Time to interactive**: -200ms
- **LCP improvement**: 600ms → 400ms
- **Lighthouse score**: +5 points
```

---

### Example Finding 4: Unoptimized Images Without Lazy Loading

```markdown
## FP-4: Large unoptimized images loaded eagerly

**File**: src/components/Gallery.tsx:18
**Severity**: HIGH
**Confidence**: 95%
**Impact**: Loading time +3.5s, bundle size +5MB

### Evidence
```tsx
// src/components/Gallery.tsx:18-25
function Gallery({ images }) {
  return (
    <div className="gallery">
      {images.map(img => (
        <img
          key={img.id}
          src={img.url}  // ❌ Full resolution (2MB each)
          alt={img.alt}
        />
      ))}
    </div>
  );
}

// Usage: <Gallery images={productImages} />
// 30 product images × 2MB = 60MB total
// All loaded immediately (no lazy loading)
```

### Issue
The gallery component has multiple performance problems:

1. **No image optimization**: Loading full 2MB images instead of responsive sizes
2. **No lazy loading**: All 30 images load immediately (60MB total)
3. **No dimensions**: Missing width/height causes layout shift
4. **No modern formats**: Using JPEG instead of WebP/AVIF

**Performance impact**:
- **Initial page load**: 60MB of images
- **Load time on 3G**: 60MB ÷ 0.5MB/s = 120 seconds
- **LCP**: 8.5s (image is largest element)
- **CLS**: 0.45 (images cause layout shift)

**User impact**: Page takes 2 minutes to fully load on mobile. User sees broken layout as images load. Wastes mobile data.

**Testing**: Open Network tab and see 60MB of images loaded immediately, all at full resolution.

### Remediation

**BEFORE**:
```tsx
function Gallery({ images }) {
  return (
    <div className="gallery">
      {images.map(img => (
        <img
          key={img.id}
          src={img.url}
          alt={img.alt}
        />
      ))}
    </div>
  );
}
```

**AFTER** (Optimized with lazy loading):
```tsx
function Gallery({ images }) {
  return (
    <div className="gallery">
      {images.map((img, index) => (
        <img
          key={img.id}
          src={img.url.replace('.jpg', '-800w.webp')}  // ✅ Optimized WebP
          srcSet={`
            ${img.url.replace('.jpg', '-400w.webp')} 400w,
            ${img.url.replace('.jpg', '-800w.webp')} 800w,
            ${img.url.replace('.jpg', '-1200w.webp')} 1200w
          `}
          sizes="(max-width: 768px) 100vw, 400px"
          alt={img.alt}
          width={400}  // ✅ Prevent layout shift
          height={300}
          loading={index < 6 ? 'eager' : 'lazy'}  // ✅ Lazy load below fold
          decoding="async"
        />
      ))}
    </div>
  );
}
```

**BETTER** (Using Next.js Image component):
```tsx
import Image from 'next/image';

function Gallery({ images }) {
  return (
    <div className="gallery">
      {images.map((img, index) => (
        <Image
          key={img.id}
          src={img.url}
          alt={img.alt}
          width={400}
          height={300}
          priority={index < 6}  // ✅ Eager load first 6, lazy rest
          quality={80}  // ✅ Compress to 80% quality
        />
      ))}
    </div>
  );
}
```

**Image optimization setup**:
```bash
# Install image optimization
npm install sharp

# Build script to generate responsive images
# scripts/optimize-images.js
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [400, 800, 1200];

fs.readdirSync('public/images').forEach(file => {
  if (!file.endsWith('.jpg')) return;

  sizes.forEach(size => {
    sharp(`public/images/${file}`)
      .resize(size)
      .webp({ quality: 80 })
      .toFile(`public/images/${file.replace('.jpg', `-${size}w.webp`)}`);
  });
});
```

**Changes**:
1. ✅ Generate responsive image sizes (400w, 800w, 1200w)
2. ✅ Convert to WebP (60% smaller than JPEG)
3. ✅ Add `srcSet` for responsive loading
4. ✅ Add `loading="lazy"` for below-fold images (index >= 6)
5. ✅ Add width/height to prevent CLS
6. ✅ Compress to 80% quality (imperceptible quality loss)

### Metrics
**Before**:
- 30 images × 2MB JPEG = 60MB
- Load time (3G): 120s
- LCP: 8.5s
- CLS: 0.45

**After**:
- 6 eager images × 80KB WebP = 480KB
- 24 lazy images × 80KB WebP = 1.92MB (loaded on scroll)
- Total initial: 480KB (99.2% reduction)
- Load time (3G): 1s (99% faster)
- LCP: 2.1s (75% improvement)
- CLS: 0.05 (89% improvement)

**Lighthouse score**: 45 → 92 (+47 points)
```

---

### Example Finding 5: Expensive Computation Without Memoization

```markdown
## FP-5: Heavy filtering and sorting on every render

**File**: src/components/ProductTable.tsx:34
**Severity**: MED
**Confidence**: 95%
**Impact**: Rendering performance +150ms per render

### Evidence
```tsx
// src/components/ProductTable.tsx:34-50
function ProductTable({ products, sortField, sortOrder, filters }) {
  // ❌ Runs on EVERY render (even when props unchanged)
  const filtered = products.filter(p => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.minPrice && p.price < filters.minPrice) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.inStock && !p.inStock) return false;
    return true;
  });

  // ❌ Runs on EVERY render
  const sorted = filtered.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortOrder === 'asc'
      ? aVal > bVal ? 1 : -1
      : aVal < bVal ? 1 : -1;
  });

  return sorted.map(p => <ProductRow key={p.id} product={p} />);
}

// Usage: Products = 5,000 items
// Parent re-renders: 10/sec (search typing)
// Filter + sort time: 150ms
// Total blocked time: 1,500ms/sec
```

### Issue
The component performs expensive filtering and sorting operations on every render, even when the data and filters haven't changed.

**Why this happens**:
- Parent component re-renders (e.g., user typing in search)
- Child `ProductTable` re-renders
- Filter + sort runs again on same data (wasted work)

**Performance impact**:
- 5,000 products filtered: ~80ms
- 5,000 products sorted: ~70ms
- **Total**: 150ms per render
- **Parent re-renders**: 10/sec (typing)
- **Blocked time**: 1,500ms/sec = main thread 150% utilized (impossible!)

Actual result: Frame drops, UI freezes during typing

**User impact**: Table feels laggy and unresponsive. Typing in search field causes stuttering.

**Testing**: Open React DevTools Profiler and see ProductTable taking 150ms+ per render.

### Remediation

**BEFORE**:
```tsx
function ProductTable({ products, sortField, sortOrder, filters }) {
  const filtered = products.filter(p => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.minPrice && p.price < filters.minPrice) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.inStock && !p.inStock) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    return sortOrder === 'asc'
      ? aVal > bVal ? 1 : -1
      : aVal < bVal ? 1 : -1;
  });

  return sorted.map(p => <ProductRow key={p.id} product={p} />);
}
```

**AFTER** (With memoization):
```tsx
function ProductTable({ products, sortField, sortOrder, filters }) {
  // ✅ Only recompute when inputs change
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.minPrice && p.price < filters.minPrice) return false;
      if (filters.maxPrice && p.price > filters.maxPrice) return false;
      if (filters.inStock && !p.inStock) return false;
      return true;
    });
  }, [products, filters]);

  // ✅ Only recompute when inputs change
  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {  // .slice() to avoid mutating
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortOrder === 'asc'
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });
  }, [filtered, sortField, sortOrder]);

  return sorted.map(p => <ProductRow key={p.id} product={p} />);
}
```

**BETTER** (Virtual scrolling for large lists):
```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function ProductTable({ products, sortField, sortOrder, filters }) {
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.minPrice && p.price < filters.minPrice) return false;
      if (filters.maxPrice && p.price > filters.maxPrice) return false;
      if (filters.inStock && !p.inStock) return false;
      return true;
    });
  }, [products, filters]);

  const sorted = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      return sortOrder === 'asc'
        ? aVal > bVal ? 1 : -1
        : aVal < bVal ? 1 : -1;
    });
  }, [filtered, sortField, sortOrder]);

  const parentRef = useRef(null);

  // ✅ Only render visible rows
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
    overscan: 10
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualRow => {
          const product = sorted[virtualRow.index];
          return (
            <ProductRow
              key={product.id}
              product={product}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
```

**Changes**:
1. ✅ Wrap filtering in `useMemo` with dependencies
2. ✅ Wrap sorting in `useMemo` with dependencies
3. ✅ Add virtual scrolling to only render visible rows
4. ✅ Now computation only runs when inputs change

**Performance comparison**:

| Scenario | Before | After (memo) | After (virtual) |
|----------|--------|--------------|-----------------|
| Initial render | 150ms | 150ms | 150ms |
| Parent re-render (same data) | 150ms | 0ms | 0ms |
| Filter change | 150ms | 150ms | 150ms |
| Scroll (5000 rows) | N/A | N/A | 5ms |

### Metrics
- **Re-render time**: 150ms → 0ms (when data unchanged)
- **Blocked time**: 1,500ms/sec → 0ms/sec (99% reduction)
- **Frame rate**: 10 FPS → 60 FPS
- **With virtualization**: Renders 20 rows instead of 5,000 (99.6% reduction)
```

---

## Step 10: False Positives Welcome

Not every finding is a bug:

1. **Intentional bundle size**: Some libraries are worth the cost (React, critical polyfills)
2. **Premature optimization**: Not all code needs memoization—only hot paths
3. **Development-only code**: Dev tools and debugging code stripped in production
4. **Framework optimizations**: Some frameworks handle optimizations automatically
5. **Small datasets**: Optimization overkill for <100 items

**Optimization priorities**:
1. Reduce initial bundle size (affects everyone)
2. Optimize LCP (user-perceived speed)
3. Fix render performance in hot paths
4. Everything else is secondary

---

## Performance Testing Checklist

### Bundle Analysis
- [ ] Run webpack-bundle-analyzer or `vite-bundle-visualizer`
- [ ] Check for duplicate dependencies
- [ ] Verify tree-shaking working (lodash-es, not lodash)
- [ ] Ensure code splitting configured

### Runtime Performance
- [ ] Run Lighthouse (target: 90+ performance score)
- [ ] Measure Core Web Vitals (LCP < 2.5s, FID < 100ms, CLS < 0.1)
- [ ] Profile with React DevTools (find expensive renders)
- [ ] Test on throttled 3G network
- [ ] Test on low-end devices (4x CPU slowdown)

### Load Testing
```bash
# Lighthouse
npx lighthouse https://localhost:3000 --view --throttling.cpuSlowdownMultiplier=4

# Bundle size
npm run build
ls -lh dist/*.js

# Web Vitals
import { getCLS, getFID, getLCP } from 'web-vitals';
getCLS(console.log);
getFID(console.log);
getLCP(console.log);
```

---

**Remember**: "Premature optimization is the root of all evil, but so is premature pessimization." Optimize what matters: bundle size, LCP, and hot paths.

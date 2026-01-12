# Visual Debug Script Template

When debugging TUI rendering issues, create a standalone script in `test/` that:

1. Imports the component being tested
2. Uses the production theme (dark theme)
3. Outputs to console for visual inspection
4. Can be run with `npx tsx test/<name>-debug.ts`
5. For streaming issues, simulates incremental content updates

## Example

```typescript
import { Component } from '../src/component'
import { darkTheme } from '../src/themes'

const component = new Component({ theme: darkTheme })

// For streaming test
const chunks = ["Hello", " world", "!"]
for (const chunk of chunks) {
    component.append(chunk)
    console.log(component.render())
}
```

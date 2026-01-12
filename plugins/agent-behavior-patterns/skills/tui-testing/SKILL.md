---
name: tui-testing
description: Interactive testing workflow for TUI changes using tmux and debug logging. Use when testing TUI rendering, keyboard input, or visual output.
---

# TUI Testing Skill

When testing TUI changes interactively, use this workflow for rapid iteration.

## Workflow

1. **Send commands via tmux**:
   ```bash
   tmux send-keys "/tree" Enter
   ```

2. **Trigger debug output**:
   - Press `Shift+Ctrl+D` to write debug log to `~/.pi/agent/pi-debug.log`

3. **Read the debug log**:
   ```bash
   cat ~/.pi/agent/pi-debug.log
   ```
   This shows rendered lines with ANSI codes and widths

4. **Iterate**:
   - Fix code based on debug output
   - Rebuild
   - Resend command via tmux
   - Check log again

## Example Session

```bash
# Start tmux session
tmux new -s tui-test

# In another pane/window, send test command
tmux send-keys -t tui-test "/tree" Enter

# User presses Shift+Ctrl+D in the TUI

# Read debug output
cat ~/.pi/agent/pi-debug.log
# Shows: Line 67 exceeds terminal width (82 > 80)

# Fix code: add truncateToWidth()
# Rebuild
# Test again
tmux send-keys -t tui-test "/tree" Enter
```

## Common Debug Scenarios

- **Width violations**: Look for "exceeds terminal width" in logs
- **ANSI rendering**: Verify escape codes with `cat -v`
- **Keyboard input**: Use key-tester.ts to capture raw input

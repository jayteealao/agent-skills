---
name: sound-notification
description: Play audio notification when a task completes. Use when user asks to "play a sound when done" or "notify when finished".
---

# Sound Notification Skill

Play an audio notification when a task completes.

## Usage

When user asks to "play a sound when done":

### macOS

```bash
afplay /System/Library/Sounds/Glass.aiff
```

### Linux

```bash
paplay /usr/share/sounds/freedesktop/stereo/complete.oga
```

### Windows (PowerShell)

```powershell
[System.Media.SystemSounds]::Asterisk.Play()
```

## Examples

User: "Build the project and play a sound when done"

1. Run the build command
2. When build completes, execute the appropriate sound command for the OS
3. Report completion: "Build completed successfully! 🔔"

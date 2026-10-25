// Git Bash converts an argument that starts with `/` into a Windows path: `/wf ship x` becomes
// `C:/Program Files/Git/wf ship x`, and so does the value after `key=`. No workflow value is a
// path into the Git install, so the conversion is undone wherever a command reads its arguments.
const MSYS_WF = /^[A-Za-z]:[\\/](?:[^\\/=]+[\\/])*?Git[\\/](?=wf(?:\s|$))/i;

/** The value without the Git install path in front of `/wf`, and whether it was repaired. */
export function undoGitBashPath(value) {
  if (typeof value !== 'string' || !MSYS_WF.test(value)) return { value, repaired: false };
  return { value: value.replace(MSYS_WF, '/'), repaired: true };
}

// Git Bash writes a Windows drive path as `/c/Users/...`. A shell that does not convert it (a
// config value, an argument after MSYS_NO_PATHCONV=1) hands that form to node, which reads it
// as `C:\c\Users\...`. On Windows the form is turned back into `C:/Users/...`.
const MSYS_DRIVE = /^\/([A-Za-z])(?=\/|$)/;

/** The Windows form of a Git Bash drive path on Windows; any other value as it is. */
export function fromGitBashPath(value, { platform = process.platform } = {}) {
  if (platform !== 'win32' || typeof value !== 'string' || !MSYS_DRIVE.test(value)) return value;
  const out = value.replace(MSYS_DRIVE, (_, d) => `${d.toUpperCase()}:`);
  return /^[A-Z]:$/.test(out) ? `${out}/` : out;
}

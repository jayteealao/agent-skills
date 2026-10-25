// Git Bash converts an argument that starts with `/` into a Windows path: `/wf ship x` becomes
// `C:/Program Files/Git/wf ship x`, and so does the value after `key=`. No workflow value is a
// path into the Git install, so the conversion is undone wherever a command reads its arguments.
const MSYS_WF = /^[A-Za-z]:[\\/](?:[^\\/=]+[\\/])*?Git[\\/](?=wf(?:\s|$))/i;

/** The value without the Git install path in front of `/wf`, and whether it was repaired. */
export function undoGitBashPath(value) {
  if (typeof value !== 'string' || !MSYS_WF.test(value)) return { value, repaired: false };
  return { value: value.replace(MSYS_WF, '/'), repaired: true };
}

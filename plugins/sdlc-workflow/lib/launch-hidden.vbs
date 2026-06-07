' launch-hidden.vbs — launch a process with no console window, fully detached.
'
' Why this exists: on Windows, Node's `spawn(..., { detached: true })` forces a
' console window that `windowsHide: true` cannot suppress (nodejs/node#21825),
' producing a terminal "flash" on every detached spawn. wscript.exe is a
' GUI-subsystem host (it never allocates a console), so spawning it produces no
' flash, and WshShell.Run with window style 0 launches the real command hidden.
' With bWaitOnReturn = False the launched process is fully independent and
' outlives this script.
'
' Usage: wscript //nologo //b launch-hidden.vbs "<exe>" "<arg1>" "<arg2>" ...
Option Explicit
Dim shell, i, cmd, arg
Set shell = CreateObject("WScript.Shell")
cmd = ""
For i = 0 To WScript.Arguments.Count - 1
  arg = WScript.Arguments(i)
  arg = Replace(arg, """", """""")            ' escape embedded quotes
  cmd = cmd & """" & arg & """"               ' wrap each argument in quotes
  If i < WScript.Arguments.Count - 1 Then cmd = cmd & " "
Next
shell.Run cmd, 0, False                        ' 0 = hidden window, False = do not wait

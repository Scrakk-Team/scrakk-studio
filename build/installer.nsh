; Copyright 2026 Scrakk Studio
; SPDX-License-Identifier: Apache-2.0
;
; Custom NSIS include: "Open with Scrakk Studio" on the Windows Explorer
; context menu for files (*) and folders (Directory). Registered under HKCU so
; it needs no admin rights, and removed on uninstall.
;
; $appExe is defined by electron-builder's installSection.nsh before
; customInstall runs.

!macro customInstall
  ; Files: right-click any file -> Open with Scrakk Studio.
  WriteRegStr HKCU "Software\Classes\*\shell\ScrakkStudio" "" "Open with Scrakk Studio"
  WriteRegStr HKCU "Software\Classes\*\shell\ScrakkStudio" "Icon" '"$appExe",0'
  WriteRegStr HKCU "Software\Classes\*\shell\ScrakkStudio\command" "" '"$appExe" "%1"'

  ; Folders: right-click a folder -> open it as the workspace explorer root.
  WriteRegStr HKCU "Software\Classes\Directory\shell\ScrakkStudio" "" "Open with Scrakk Studio"
  WriteRegStr HKCU "Software\Classes\Directory\shell\ScrakkStudio" "Icon" '"$appExe",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\ScrakkStudio\command" "" '"$appExe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\ScrakkStudio"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\ScrakkStudio"
!macroend

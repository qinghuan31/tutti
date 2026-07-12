!macro tuttiContains OUT NEEDLE HAYSTACK
  Push `${HAYSTACK}`
  Push `${NEEDLE}`
  Call StrContains
  Pop `${OUT}`
!macroend

!ifdef BUILD_UNINSTALLER
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.normalizeInstallDirectory

Function un.normalizeInstallDirectory
FunctionEnd
!else
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE normalizeInstallDirectory

Function normalizeInstallDirectory
  GetDlgItem $0 $HWNDPARENT 1019
  StrCmp $0 0 done
  System::Call "user32::GetWindowText(p $0, t .r1, i ${NSIS_MAX_STRLEN})"
  StrCpy $2 $1 1 -1
  StrCmp $2 "\" 0 +2
  StrCpy $1 $1 -1

  !insertmacro tuttiContains $2 "${APP_FILENAME}" $1
  StrCmp $2 "" 0 done
  System::Call "user32::SetWindowText(p $0, t '$1\${APP_FILENAME}')"

  done:
FunctionEnd
!endif

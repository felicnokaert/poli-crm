@echo off
rem Crea en el escritorio dos accesos directos que imprimen los remitos SIN mostrar la ventana de imprimir:
rem   "Conteo (imprime solo)"  -> la app de conteo (operarios)
rem   "CRM (imprime solo)"     -> el CRM (Entregas dentro del CRM)
rem Los dos abren un Chrome aparte (--kiosk-printing) que manda todo a la impresora predeterminada de Windows.
rem Usan un perfil de Chrome propio (carpeta ChromeImprimeSolo), asi andan aunque el Chrome de siempre este abierto.
rem No instala nada ni cambia otra cosa de la compu.
setlocal
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo No encontre Google Chrome en esta compu. Instalalo desde https://www.google.com/chrome y volve a abrir este archivo.
  pause
  exit /b 1
)
call :crear "Conteo (imprime solo)" "https://poliplast-conteo-stock.netlify.app/" "Conteo y Entregas: imprime los remitos solo, sin preguntar"
call :crear "CRM (imprime solo)" "https://poli-crm.vercel.app/" "CRM: imprime los remitos solo, sin preguntar"
echo.
echo Listo: en el escritorio estan "Conteo (imprime solo)" y "CRM (imprime solo)".
echo.
echo Que falta (una sola vez):
echo  1. Cerrar las ventanas que ya esten abiertas con esos accesos (si las hay) y volver a abrirlas desde el escritorio.
echo  2. Impresora predeterminada: Configuracion ^> Bluetooth y dispositivos ^> Impresoras y escaneres:
echo     apagar "Permitir que Windows administre la impresora predeterminada" y elegir la del deposito como predeterminada.
echo  3. La primera vez, iniciar sesion (queda guardada). En Entregas ^> Expedicion hoy tildar
echo     "Esta compu imprime sola los remitos nuevos" en la compu del deposito.
echo  4. Imprimir SOLO desde estas ventanas: en el Chrome de siempre sigue apareciendo la ventana de imprimir.
echo.
pause
exit /b 0

:crear
set "NOMBRE=%~1"
set "URL=%~2"
set "DESC=%~3"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$lnk = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), $env:NOMBRE + '.lnk'));" ^
  "$lnk.TargetPath = $env:CHROME;" ^
  "$lnk.Arguments = '--kiosk-printing --user-data-dir=\"' + $env:LOCALAPPDATA + '\ChromeImprimeSolo\" --no-first-run ' + $env:URL;" ^
  "$lnk.IconLocation = $env:CHROME + ',0';" ^
  "$lnk.Description = $env:DESC;" ^
  "$lnk.Save()"
exit /b 0

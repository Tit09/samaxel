@echo off
chcp 65001 >nul
rem ===========================================================================
rem  SAMA XHEL - inventaire logiciel (SBOM) et envoi au tableau de bord Dependency-Track
rem  A lancer depuis C:\SAMA-XHEL\serveur :   securite\envoyer-sbom.bat
rem  Avant : docker compose up -d   puis   docker compose --profile securite up -d
rem ===========================================================================
setlocal
set "RACINE=%~dp0..\.."
pushd "%RACINE%"
set "RACINE=%CD%"
popd
set "SORTIE=%~dp0sbom"
if not exist "%SORTIE%" mkdir "%SORTIE%"

rem Cle API Dependency-Track : demandee une fois, gardee sur CE PC uniquement (jamais sur GitHub)
set "FICHIER_CLE=%~dp0cle-dependency-track.txt"
if exist "%FICHIER_CLE%" goto cle_prete
echo Collez la cle API (Dependency-Track : Administration, Access Management, Teams, Automation) :
set /p "SAISIE=> "
>"%FICHIER_CLE%" echo %SAISIE%
:cle_prete
set /p CLE=<"%FICHIER_CLE%"

echo.
echo [1/4] Inventaire de l'image Docker de l'API (samaxhel-api)...
docker run --rm -v //var/run/docker.sock:/var/run/docker.sock -v "%SORTIE%:/sortie" aquasec/trivy:0.58.1 image --quiet --format cyclonedx --output /sortie/sbom-api.cdx.json samaxhel-api
if errorlevel 1 goto erreur

echo [2/4] Inventaire de l'application Flutter (pubspec.lock)...
docker run --rm -v "%RACINE%\app-sante:/projet:ro" -v "%SORTIE%:/sortie" aquasec/trivy:0.58.1 fs --quiet --format cyclonedx --output /sortie/sbom-app.cdx.json /projet/pubspec.lock
if errorlevel 1 goto erreur

echo [3/4] Envoi de l'inventaire de l'API au tableau de bord...
curl.exe --fail -s -o nul -X POST http://localhost:8081/api/v1/bom -H "X-Api-Key: %CLE%" -F "autoCreate=true" -F "projectName=SAMA XHEL - API (image Docker)" -F "projectVersion=1.0.0" -F "bom=@%SORTIE%\sbom-api.cdx.json"
if errorlevel 1 goto erreur_envoi

echo [4/4] Envoi de l'inventaire de l'application au tableau de bord...
curl.exe --fail -s -o nul -X POST http://localhost:8081/api/v1/bom -H "X-Api-Key: %CLE%" -F "autoCreate=true" -F "projectName=SAMA XHEL - Application Flutter" -F "projectVersion=1.0.0" -F "bom=@%SORTIE%\sbom-app.cdx.json"
if errorlevel 1 goto erreur_envoi

echo.
echo Termine. Ouvrez http://localhost:8082 : les chiffres apparaissent apres 1 a 2 minutes d'analyse.
goto fin

:erreur_envoi
echo.
echo Envoi refuse. Verifiez que "docker compose --profile securite up -d" tourne, que la cle est bonne
echo et que l'equipe Automation a la permission PROJECT_CREATION_UPLOAD.
echo Pour ressaisir la cle : supprimez le fichier "%FICHIER_CLE%".
goto fin

:erreur
echo.
echo Echec de Trivy. Docker Desktop est-il demarre ? L'image samaxhel-api existe-t-elle (docker compose up -d) ?

:fin
endlocal
pause

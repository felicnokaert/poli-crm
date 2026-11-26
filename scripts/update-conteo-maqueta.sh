#!/usr/bin/env bash
# Poliplast App (prueba): actualiza la maqueta de la app de conteo (Etiquetas, Conteo, Dosificado) que se ve en el
# link de prueba. Necesita el repo felicnokaert/poliplast-app clonado (por defecto ../poliplast-app), rama main-dae273.
set -euo pipefail
APP="${1:-../poliplast-app}"
(cd "$APP" && npm ci --no-audit --no-fund && MAQUETA_BASE=/conteo-maqueta/ npm run build:maqueta)
rm -rf demo/conteo-maqueta && mkdir -p demo/conteo-maqueta
cp -r "$APP/dist/." demo/conteo-maqueta/
rm -rf demo/conteo-maqueta/entregas demo/conteo-maqueta/guia demo/conteo-maqueta/_redirects demo/conteo-maqueta/sw.js
echo "poliplast-app $(git -C "$APP" rev-parse --abbrev-ref HEAD) $(git -C "$APP" rev-parse --short HEAD)" > demo/conteo-maqueta/ORIGEN.txt

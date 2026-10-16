"""Pasa una carpeta entera a Markdown con MarkItDown, para subir a Base técnica.

Sirve para los formatos que el navegador no lee solo (Word .doc viejo, .xls, imágenes con texto,
etc.). Deja los .md en otra carpeta con la misma estructura de subcarpetas; los originales no se tocan.

Uso (en la compu donde está instalado markitdown):
    python scripts/markitdown-carpeta.py "C:/ruta/a/la/carpeta" "C:/ruta/de/salida"
Después, en el CRM: Base técnica -> Subir fichas y documentos -> Elegir una carpeta entera (la de salida).
"""
import sys
from pathlib import Path

from markitdown import MarkItDown

# Lo que el CRM ya lee solo (PDF, .docx, .xlsx, .pptx, .txt, .md, .csv) no hace falta convertirlo.
YA_LO_LEE_EL_CRM = {".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv"}


def main(origen: str, destino: str, todo: bool = False) -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    origen_path, destino_path = Path(origen), Path(destino)
    conversor = MarkItDown()
    hechos, salteados, errores = 0, 0, []
    for archivo in sorted(origen_path.rglob("*")):
        if not archivo.is_file() or archivo.name.startswith("~$"):
            continue
        if not todo and archivo.suffix.lower() in YA_LO_LEE_EL_CRM:
            salteados += 1
            continue
        salida = destino_path / archivo.relative_to(origen_path).with_suffix(archivo.suffix + ".md")
        try:
            texto = conversor.convert(str(archivo)).text_content
        except Exception as error:  # un archivo roto no frena al resto
            errores.append(f"{archivo}: {error}")
            continue
        if not texto.strip():
            errores.append(f"{archivo}: sin texto")
            continue
        salida.parent.mkdir(parents=True, exist_ok=True)
        salida.write_text(texto, encoding="utf-8")
        hechos += 1
    print(f"Convertidos: {hechos} · ya los lee el CRM (no hacía falta): {salteados} · con problemas: {len(errores)}")
    for linea in errores:
        print("  -", linea)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2], todo="--todo" in sys.argv)

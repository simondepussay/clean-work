#!/bin/sh
# Crée le zip à envoyer sur le Chrome Web Store (sans les fichiers de développement).
cd "$(dirname "$0")" && rm -f clean-work-extension.zip && zip -qr clean-work-extension.zip manifest.json background.js extract.js icons && echo "clean-work-extension.zip"

# Police du 履歴書

`NotoSerifJP-Regular.ttf` : Noto Serif JP (SIL Open Font License, voir `LICENSE-OFL.txt`),
convertie en TrueType avec `tools/otf2ttf.py` depuis
https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/JP/NotoSerifJP-Regular.otf

Pourquoi convertir : pdf-lib mélange les caractères quand il découpe une police à contours CFF.
Pourquoi pas de gras : la version Bold découpée s'arrête après le premier caractère (bug de
fontkit) et, embarquée entière, alourdit le PDF de 4,5 Mo. Le modèle du 厚生労働省 n'utilise
pas de gras : titre et nom se distinguent par la taille.

# Police du 履歴書

`NotoSerifJP-Regular.ttf` : Noto Serif JP (SIL Open Font License, voir `LICENSE-OFL.txt`),
convertie en TrueType avec `tools/otf2ttf.py` depuis
https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/JP/NotoSerifJP-Regular.otf

Pourquoi convertir : pdf-lib mélange les caractères quand il découpe une police à contours CFF.

Pourquoi aligner chaque glyphe sur 4 octets (`glyf.padding = 4`) : dans un PDF avec peu de
caractères, la police découpée utilise des offsets « courts » (divisés par 2). Un glyphe de
longueur impaire décalait alors tous les suivants (« simon » → « im »). Testé par
`api/test/resumeFont.test.ts`, qui échoue avec une police non alignée.

Pas de gras : le modèle du 厚生労働省 n'en utilise pas (titre et nom se distinguent par la taille).
La version Bold s'arrêtait après le premier caractère — très probablement la même cause.

"""Convertit une police OpenType à contours CFF en TrueType (contours « glyf »).

pdf-lib découpe mal les polices CFF (les caractères sortent mélangés dans le PDF),
mais découpe correctement les polices TrueType. On convertit donc Noto Serif JP
une fois, ici, et c'est le .ttf qui est versionné dans api/assets/fonts.

    python3 tools/otf2ttf.py NotoSerifJP-Regular.otf api/assets/fonts/NotoSerifJP-Regular.ttf

Nécessite fontTools (pip install fonttools). Adapté de l'exemple « otf2ttf » de fontTools.
"""
import sys

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

# Erreur maximale de l'approximation, en unités de la police (1 000 par em) : invisible.
MAX_ERR = 1.0


def to_quadratic(glyph_set):
    """Les courbes cubiques (CFF) deviennent des courbes quadratiques (TrueType)."""
    glyphs = {}
    for name in glyph_set.keys():
        tt_pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(tt_pen, MAX_ERR, reverse_direction=True))
        glyphs[name] = tt_pen.glyph()
    return glyphs


def convert(src, dst):
    font = TTFont(src)
    assert font.sfntVersion == "OTTO" and "CFF " in font, "ce n'est pas une police CFF"
    order = font.getGlyphOrder()

    font["loca"] = newTable("loca")
    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = to_quadratic(font.getGlyphSet())
    # Chaque glyphe aligné sur 4 octets. Sans cela, certains ont une longueur impaire : quand
    # pdf-lib découpe la police pour un PDF avec peu de caractères, il choisit des offsets
    # « courts » (divisés par 2), qui décalent tous les glyphes suivants (caractères manquants).
    glyf.padding = 4
    del font["CFF "]
    # VORG est propre au CFF ; DSIG (signature de la police d'origine) n'est plus valable.
    for table in ("VORG", "DSIG"):
        if table in font:
            del font[table]
    glyf.compile(font)

    # Approche gauche des glyphes, recalculée sur les nouveaux contours.
    hmtx = font["hmtx"]
    for name, glyph in glyf.glyphs.items():
        if hasattr(glyph, "xMin"):
            hmtx[name] = (hmtx[name][0], glyph.xMin)

    maxp = font["maxp"] = newTable("maxp")
    maxp.tableVersion = 0x00010000
    for field in ("maxZones", "maxTwilightPoints", "maxStorage", "maxFunctionDefs",
                  "maxInstructionDefs", "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
        setattr(maxp, field, 1 if field == "maxZones" else 0)
    maxp.compile(font)

    post = font["post"]
    post.formatType, post.extraNames, post.mapping, post.glyphOrder = 2.0, [], {}, order
    try:
        post.compile(font)
    except OverflowError:
        post.formatType = 3.0  # trop de noms de glyphes : on s'en passe

    font.sfntVersion = "\000\001\000\000"
    font.save(dst)


if __name__ == "__main__":
    convert(sys.argv[1], sys.argv[2])

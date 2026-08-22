"""
Extend the Söhne trial cuts with the punctuation the subset omits.

The befonts trial files carry 68 glyphs: space , - . 0-9 A-Z a-z Ö ö. Every
figure format the HYBRID type spec defines needs at least one glyph outside that
set — `5:12 /km`, `87%`, `24 × 8`, `01:42:18`, `+8.4%` — and a missing glyph in
a browser falls through to the next family in the stack, so a clock would draw
its digits in Söhne and its colon in something else.

Every dimension below is MEASURED FROM THE FONT BEING EXTENDED — the hyphen's
bar gives thickness and the math axis, the period gives the dot, the capital I
gives the stem — so each weight's punctuation matches that weight rather than a
constant borrowed from one cut. Nothing here is copied between files.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen

K = 0.55228474983  # circle-to-bezier constant


def measure(ft):
    gs, hm, cmap = ft.getGlyphSet(), ft['hmtx'], ft.getBestCmap()
    def bounds(ch):
        g = cmap[ord(ch)]
        bp = BoundsPen(gs); gs[g].draw(bp)
        return g, hm[g][0], bp.bounds
    _, dotAdv, dot = bounds('.')
    _, hypAdv, hyp = bounds('-')
    _, _, cap = bounds('I')
    os2 = ft['OS/2']
    return {
        "dot": dot, "dotAdv": dotAdv,
        "bar": hyp[3] - hyp[1],            # hyphen bar thickness
        "axis": (hyp[1] + hyp[3]) / 2,     # the math axis, from the hyphen
        "hypAdv": hypAdv, "hypW": hyp[2] - hyp[0], "hypL": hyp[0],
        "stem": (hyp[3] - hyp[1]) * 1.05,   # NOT from `I` — see note in extend()
        "x": os2.sxHeight, "capH": os2.sCapHeight,
        "mono": len({hm[g][0] for g in ft.getGlyphOrder() if g != '.notdef'}) == 1,
        "monoAdv": hm[cmap[ord('0')]][0],
    }


def rect(pen, x0, y0, x1, y1):
    # Clockwise, for the same winding reason as `diagonal`.
    pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()


def ring(pen, cx, cy, r, t):
    """An annulus — outer contour clockwise, inner counter-clockwise, so the
       non-zero fill leaves a hole."""
    for rad, ccw in ((r, False), (r - t, True)):
        k = rad * K
        pen.moveTo((cx, cy + rad))
        if not ccw:
            pen.curveTo((cx + k, cy + rad), (cx + rad, cy + k), (cx + rad, cy))
            pen.curveTo((cx + rad, cy - k), (cx + k, cy - rad), (cx, cy - rad))
            pen.curveTo((cx - k, cy - rad), (cx - rad, cy - k), (cx - rad, cy))
            pen.curveTo((cx - rad, cy + k), (cx - k, cy + rad), (cx, cy + rad))
        else:
            pen.curveTo((cx - k, cy + rad), (cx - rad, cy + k), (cx - rad, cy))
            pen.curveTo((cx - rad, cy - k), (cx - k, cy - rad), (cx, cy - rad))
            pen.curveTo((cx + k, cy - rad), (cx + rad, cy - k), (cx + rad, cy))
            pen.curveTo((cx + rad, cy + k), (cx + k, cy + rad), (cx, cy + rad))
        pen.closePath()


def diagonal(pen, x0, y0, x1, y1, t):
    """A stroke of thickness `t` measured HORIZONTALLY, which is how a slash is
       drawn: the vertical cut keeps the join with adjacent glyphs clean."""
    # CLOCKWISE, to match the ring outers and the fonts' own outer contours.
    # Non-zero winding means a counter-clockwise quad laid over a clockwise
    # outline SUBTRACTS: that is what made the mono l-slash's bar vanish where
    # it crossed the stem, and left the sans one as two stubs either side of it.
    h = t / 2
    pen.moveTo((x0 - h, y0)); pen.lineTo((x1 - h, y1))
    pen.lineTo((x1 + h, y1)); pen.lineTo((x0 + h, y0)); pen.closePath()


def draw(name, pen, m):
    bar, axis, x, capH = m["bar"], m["axis"], m["x"], m["capH"]
    dx0, dy0, dx1, dy1 = m["dot"]
    dotW, dotH = dx1 - dx0, dy1 - dy0

    if name == "colon":
        # Two periods. The upper dot's top lands on the x-height, which is where
        # the eye expects a colon to sit against lining figures.
        rect(pen, dx0, dy0, dx1, dy1)
        lift = x - dotH
        rect(pen, dx0, dy0 + lift, dx1, dy1 + lift)
        return m["dotAdv"]

    if name in ("endash", "emdash"):
        w = 500 if name == "endash" else 1000
        if m["mono"]: w = m["monoAdv"] * (0.62 if name == "endash" else 0.86)
        adv = m["monoAdv"] if m["mono"] else w
        l = (adv - w) / 2
        rect(pen, l, axis - bar / 2, l + w, axis + bar / 2)
        return adv

    if name == "plus":
        # Arms sized from the hyphen so + and - read as one family.
        w = m["hypW"] * 1.08
        adv = m["monoAdv"] if m["mono"] else round(w + 2 * m["hypL"] * 1.15)
        cx = adv / 2
        rect(pen, cx - w / 2, axis - bar / 2, cx + w / 2, axis + bar / 2)
        rect(pen, cx - bar / 2, axis - w / 2, cx + bar / 2, axis + w / 2)
        return adv

    if name == "multiply":
        # Slightly lighter than the plus: a diagonal of equal measured width
        # reads heavier than an orthogonal one.
        w = m["hypW"] * 0.86
        t = bar * 0.94
        adv = m["monoAdv"] if m["mono"] else round(w + 2 * m["hypL"] * 1.3)
        cx, r = adv / 2, w / 2
        diagonal(pen, cx - r, axis - r, cx + r, axis + r, t)
        diagonal(pen, cx + r, axis - r, cx - r, axis + r, t)
        return adv

    if name == "slash":
        t = m["stem"]
        top, bot = capH * 1.02, -capH * 0.10
        lean = (top - bot) * 0.30
        if m["mono"]:
            # Fit the lean inside the fixed advance, or the diagonal runs past
            # its own cell and collides with the glyphs either side.
            adv = m["monoAdv"]
            lean = min(lean, adv - t - 2 * (adv * 0.06))
        else:
            adv = round(lean + t + 2 * m["hypL"] * 0.55)
        cx = adv / 2
        diagonal(pen, cx - lean / 2, bot, cx + lean / 2, top, t)
        return adv

    if name == "degree":
        t = bar * 0.86
        r = x * 0.30
        adv = m["monoAdv"] if m["mono"] else round(2 * r + 2 * m["hypL"] * 1.2)
        ring(pen, adv / 2, capH - r, r, t)
        return adv

    if name == "percent":
        t = bar * 0.80
        r = x * 0.29
        st = m["stem"] * 0.86
        top, bot = capH * 1.0, 0
        lean = (top - bot) * 0.28
        w = 2 * r + lean
        if m["mono"]:
            # The whole mark has to live inside one 600-unit cell, so shrink the
            # rings and the lean together rather than letting the bar overrun and
            # swallow them — which is exactly how the first cut drew a blob.
            adv = m["monoAdv"]
            fit = (adv * 0.84) / w
            if fit < 1:
                r, lean, st, t = r * fit, lean * fit, st * fit, t * fit
                w = 2 * r + lean
        else:
            adv = round(w + 2 * m["hypL"] * 1.1)
        left = (adv - w) / 2
        ring(pen, left + r, capH - r, r, t)              # upper left
        ring(pen, left + w - r, r, r, t)                 # lower right
        cx = left + w / 2
        diagonal(pen, cx - lean / 2, bot, cx + lean / 2, top, st)
        return adv


# ─────────────────────────────────────────────────────────────────────────────
# PASS 2 — the glyphs the DOCUMENT needs, as opposed to the figure formats.
#
# Running prose wants parentheses, an apostrophe, a semicolon and a question
# mark; the token listing wants braces and an equals; the tracking table wants a
# real MINUS (U+2212, not a hyphen); and the type's own weight names want ä
# (Kräftig) as the athlete's name wants ł (Rafał).
#
# Composites reuse the font's OWN outlines through a transform pen — ä is the
# font's `a` under two of its own periods, ; is its comma under the colon's
# upper dot — so those are not drawn at all, only assembled. Only the marks with
# no component in a 68-glyph subset are drawn, and each is derived from the same
# hyphen-bar stroke as pass 1.
# ─────────────────────────────────────────────────────────────────────────────
from fontTools.pens.transformPen import TransformPen

GLYPHS2 = {
    "parenleft": 0x28, "parenright": 0x29, "quotesingle": 0x27, "quotedbl": 0x22,
    "semicolon": 0x3B, "minus": 0x2212, "equal": 0x3D, "question": 0x3F,
    "adieresis": 0xE4, "lslash": 0x142, "bracketleft": 0x5B, "bracketright": 0x5D,
    "underscore": 0x5F, "minute": 0x2032, "second": 0x2033,
    "braceleft": 0x7B, "braceright": 0x7D, "greater": 0x3E, "less": 0x3C,
    "numbersign": 0x23, "asterisk": 0x2A, "arrowright": 0x2192,
}


def arc(pen, cx, cy, rx, ry, t, y0, y1, flip=False):
    """A vertical crescent — the stroke a parenthesis or a bracket bowl is made
       of. Drawn as an outer and an inner half-ellipse joined at the ends."""
    s = -1 if flip else 1
    kx, ky = rx * K, ry * K
    pen.moveTo((cx, y1))
    pen.curveTo((cx - s * kx, y1), (cx - s * rx, cy + ky), (cx - s * rx, cy))
    pen.curveTo((cx - s * rx, cy - ky), (cx - s * kx, y0), (cx, y0))
    ri = rx - t
    pen.curveTo((cx - s * ri * K, y0), (cx - s * ri, cy - ky), (cx - s * ri, cy))
    pen.curveTo((cx - s * ri, cy + ky), (cx - s * ri * K, y1), (cx, y1))
    pen.closePath()


def draw2(name, pen, m, ft, gs, cmap):
    bar, axis, x, capH = m["bar"], m["axis"], m["x"], m["capH"]
    dx0, dy0, dx1, dy1 = m["dot"]
    dotW, dotH = dx1 - dx0, dy1 - dy0
    stem = m["stem"]
    mono, mAdv = m["mono"], m["monoAdv"]

    def place(ch, dx, dy, sx=1.0, sy=1.0):
        """Draw one of the font's own glyphs, moved/scaled."""
        gs[cmap[ord(ch)]].draw(TransformPen(pen, (sx, 0, 0, sy, dx, dy)))

    def bbox(ch):
        g = cmap[ord(ch)]
        bp = BoundsPen(gs); gs[g].draw(bp)
        return bp.bounds, ft["hmtx"][g][0]

    if name in ("parenleft", "parenright"):
        top, bot = capH * 1.04, -capH * 0.28
        cy, ry = (top + bot) / 2, (top - bot) / 2
        rx = ry * 0.40
        adv = mAdv if mono else round(rx + stem * 1.4 + m["hypL"] * 1.6)
        cx = adv * (0.70 if name == "parenleft" else 0.30)
        arc(pen, cx, cy, rx, ry, stem * 1.02, bot, top, flip=(name == "parenright"))
        return adv

    if name in ("bracketleft", "bracketright"):
        top, bot = capH * 1.04, -capH * 0.28
        w = capH * 0.26
        adv = mAdv if mono else round(w + stem + m["hypL"] * 1.6)
        s = 1 if name == "bracketleft" else -1
        cx = adv * (0.62 if name == "bracketleft" else 0.38)
        x0 = cx - s * w
        rect(pen, min(x0, x0 + s * stem), bot, max(x0, x0 + s * stem), top)   # spine
        rect(pen, min(x0, cx), top - stem, max(x0, cx), top)                  # arms
        rect(pen, min(x0, cx), bot, max(x0, cx), bot + stem)
        return adv

    if name in ("braceleft", "braceright"):
        top, bot = capH * 1.04, -capH * 0.28
        cy = (top + bot) / 2
        ry = (top - bot) / 4
        rx = capH * 0.15
        adv = mAdv if mono else round(rx * 2 + stem + m["hypL"] * 1.6)
        s = 1 if name == "braceleft" else -1
        cx = adv / 2 + s * rx * 0.42
        # Two stacked crescents plus the waist that joins them.
        arc(pen, cx, cy + ry, rx, ry, stem, cy, top, flip=(s < 0))
        arc(pen, cx, cy - ry, rx, ry, stem, bot, cy, flip=(s < 0))
        rect(pen, min(cx - s * rx, cx - s * (rx + stem * 0.9)),
             cy - stem / 2,
             max(cx - s * rx, cx - s * (rx + stem * 0.9)), cy + stem / 2)
        return adv

    if name in ("quotesingle", "quotedbl", "minute", "second"):
        top = capH * 1.02
        h = capH * 0.30
        w = stem * 0.92
        lean = w * 0.55 if name in ("minute", "second") else 0
        n = 2 if name in ("quotedbl", "second") else 1
        gap = w * 1.30
        span = w * n + gap * (n - 1) + lean
        adv = mAdv if mono else round(span + m["hypL"] * 2.0)
        left = (adv - span) / 2
        for i in range(n):
            bx = left + i * (w + gap)
            pen.moveTo((bx + lean, top)); pen.lineTo((bx + lean + w, top))
            pen.lineTo((bx + w, top - h)); pen.lineTo((bx, top - h)); pen.closePath()
        return adv

    if name == "semicolon":
        # The colon's upper dot over the font's own comma — both components are
        # in the subset, so nothing here is drawn.
        cb, cadv = bbox(",")
        place(",", 0, 0)
        rect(pen, dx0, dy0 + (x - dotH), dx1, dy1 + (x - dotH))
        return cadv

    if name == "minus":
        # A real minus sits on the math axis and is wider than a hyphen; the
        # tracking table is full of them and a hyphen there reads as a dash.
        w = m["hypW"] * 1.08
        adv = mAdv if mono else round(w + 2 * m["hypL"] * 1.15)
        left = (adv - w) / 2
        rect(pen, left, axis - bar / 2, left + w, axis + bar / 2)
        return adv

    if name == "equal":
        w = m["hypW"] * 1.08
        gap = bar * 1.35
        adv = mAdv if mono else round(w + 2 * m["hypL"] * 1.15)
        left = (adv - w) / 2
        rect(pen, left, axis + gap / 2, left + w, axis + gap / 2 + bar)
        rect(pen, left, axis - gap / 2 - bar, left + w, axis - gap / 2)
        return adv

    if name == "underscore":
        w = m["hypW"] * 1.45
        adv = mAdv if mono else round(w)
        rect(pen, (adv - w) / 2, -capH * 0.22, (adv - w) / 2 + w, -capH * 0.22 + bar)
        return adv

    if name in ("greater", "less"):
        w = m["hypW"] * 0.92
        t = bar * 0.98
        adv = mAdv if mono else round(w + 2 * m["hypL"] * 1.25)
        cx, r = adv / 2, w / 2
        s = 1 if name == "greater" else -1
        diagonal(pen, cx - s * r, axis + r, cx + s * r, axis, t)
        diagonal(pen, cx + s * r, axis, cx - s * r, axis - r, t)
        return adv

    if name == "numbersign":
        # Hex colours are quoted throughout the spec, so this one is content.
        t = bar * 0.96
        w = m["hypW"] * 1.12
        adv = mAdv if mono else round(w + 2 * m["hypL"] * 1.1)
        cx, top, bot = adv / 2, capH * 0.96, 0
        lean = w * 0.13
        for k in (-1, 1):
            sx = cx + k * w * 0.21
            diagonal(pen, sx - lean, bot, sx + lean, top, t)
        for k in (-1, 1):
            cy = axis + k * w * 0.20
            rect(pen, cx - w / 2, cy - t / 2, cx + w / 2, cy + t / 2)
        return adv

    if name == "asterisk":
        # `text.*` is how the spec names the style set, so the mark is prose.
        import math
        t = bar * 0.92
        r = x * 0.46
        adv = mAdv if mono else round(2 * r + m["hypL"] * 2.0)
        cx, cy = adv / 2, capH - r * 0.92
        for i in range(5):
            a = math.pi / 2 + i * 2 * math.pi / 5
            diagonal(pen, cx, cy, cx + r * math.cos(a), cy + r * math.sin(a), t)
        return adv

    if name == "arrowright":
        t = bar * 0.96
        w = m["hypW"] * 1.30
        adv = mAdv if mono else round(w + 2 * m["hypL"] * 1.0)
        left = (adv - w) / 2
        rect(pen, left, axis - t / 2, left + w, axis + t / 2)
        h = w * 0.30
        diagonal(pen, left + w - h, axis + h, left + w, axis, t * 1.02)
        diagonal(pen, left + w, axis, left + w - h, axis - h, t * 1.02)
        return adv

    if name == "question":
        t = stem
        r = x * 0.42
        top = capH
        adv = mAdv if mono else round(r * 2 + m["hypL"] * 2.2)
        cx = adv / 2
        # Bowl: the upper three quarters of a ring, opening at the lower left.
        ky = r * K
        pen.moveTo((cx - r, top - r))
        pen.curveTo((cx - r, top - r + ky), (cx - r * K, top), (cx, top))
        pen.curveTo((cx + r * K, top), (cx + r, top - r + ky), (cx + r, top - r))
        pen.curveTo((cx + r, top - r - ky * 0.7), (cx + t / 2, top - r * 1.5), (cx + t / 2, top - r * 1.85))
        pen.lineTo((cx - t / 2, top - r * 1.85))
        pen.curveTo((cx - t / 2, top - r * 1.35), (cx + r - t, top - r + ky * 0.5), (cx + r - t, top - r))
        pen.curveTo((cx + r - t, top - r + ky * 0.4), (cx + (r - t) * K, top - t), (cx, top - t))
        pen.curveTo((cx - (r - t) * K, top - t), (cx - r + t, top - r + ky * 0.4), (cx - r + t, top - r))
        pen.closePath()
        rect(pen, cx - t / 2, top - r * 1.85, cx + t / 2, top - r * 1.62)   # stem
        rect(pen, cx - dotW / 2, dy0, cx + dotW / 2, dy1)                    # dot
        return adv

    if name == "adieresis":
        ab, aadv = bbox("a")
        place("a", 0, 0)
        # Just clear of the x-height, NOT clear of the cap: a dieresis set from
        # the cap line reads as two dots floating over the letter.
        lift = x + dotH * 0.34
        cx = aadv / 2
        sep = dotW * 0.92
        rect(pen, cx - sep - dotW / 2, dy0 + lift, cx - sep + dotW / 2, dy1 + lift)
        rect(pen, cx + sep - dotW / 2, dy0 + lift, cx + sep + dotW / 2, dy1 + lift)
        return aadv

    if name == "lslash":
        _, ladv = bbox("l")
        place("l", 0, 0)
        # Sized from the HYPHEN, not from the l's bounding box: in the mono cut
        # `l` carries a full-width foot serif, so its bbox reports the cell and
        # not the stem — the same trap that drew the slash as a blob.
        cx = ladv / 2
        w = m["hypW"] * 0.62
        cy = capH * 0.54
        diagonal(pen, cx - w / 2, cy - w * 0.46, cx + w / 2, cy + w * 0.46, bar * 0.90)
        return ladv


GLYPHS = {
    "colon": 0x3A, "percent": 0x25, "slash": 0x2F, "multiply": 0xD7,
    "degree": 0xB0, "plus": 0x2B, "endash": 0x2013, "emdash": 0x2014,
}


def extend(src, dst):
    ft = TTFont(src)
    m = measure(ft)
    cmap0 = dict(ft.getBestCmap())
    cff = ft["CFF "].cff
    top = cff[cff.fontNames[0]]
    cs, gs = top.CharStrings, ft.getGlyphSet()
    order = list(ft.getGlyphOrder())

    ALL = {**GLYPHS, **GLYPHS2}
    for name, cp in ALL.items():
        assert name not in cs, f"{name} already present in {src}"
        fn = (lambda n, p: draw(n, p, m)) if name in GLYPHS else (lambda n, p: draw2(n, p, m, ft, gs, cmap0))
        probe = T2CharStringPen(0, gs)
        adv = round(fn(name, probe))
        pen = T2CharStringPen(adv, gs)
        fn(name, pen)
        char = pen.getCharString(private=top.Private)
        # CFF CharStrings is index-backed: __setitem__ only rebinds a name that
        # already exists, so a NEW glyph has to be appended to the index and
        # then registered in the name map and the charset.
        if getattr(cs, "charStringsAreIndexed", False):
            cs.charStringsIndex.append(char)
            cs.charStrings[name] = len(cs.charStringsIndex) - 1
        else:
            cs.charStrings[name] = char
        top.charset.append(name)
        bp = BoundsPen({name: char}); char.draw(bp)
        ft["hmtx"][name] = (adv, int(bp.bounds[0]) if bp.bounds else 0)
        order.append(name)

    ft.setGlyphOrder(order)
    ft["maxp"].numGlyphs = len(order)
    for t in ft["cmap"].tables:
        for name, cp in ALL.items():
            t.cmap[cp] = name
    ft.flavor = "woff2"
    ft.save(dst)
    return len(order)


if __name__ == "__main__":
    print(extend(sys.argv[1], sys.argv[2]), "glyphs ->", sys.argv[2])



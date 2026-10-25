// Carte finale de la vidéo (6 s, 30 i/s) : logo, nom, slogan, adresse, et image de la notification à incruster.
// Dessinées par le code (CoreGraphics, CoreText, AVFoundation) : l'IA écrit mal le japonais et déforme les logos.
//
//   swift tools/make_endcard.swift marketing/beta-ad
//
// Produit : endcard-9x16.mp4 (1080×1920), endcard-16x9.mp4 (1920×1080), notification-9x16.png (fond transparent).
import AVFoundation
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let outDir = CommandLine.arguments.dropFirst().first ?? "."
let space = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ hex: Int, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}
let blue950 = 0x0c1f3a, blue800 = 0x163a6b, blue700 = 0x1d4f91, blue300 = 0x9dbfe8, blue50 = 0xf3f7fc, bordeaux = 0x7b1e2e, muted = 0x5b6b80

// MARK: courbes d'animation

func clamp(_ x: CGFloat) -> CGFloat { min(max(x, 0), 1) }
/// Progression de 0 à 1 entre `start` et `end` (secondes).
func phase(_ t: CGFloat, _ start: CGFloat, _ end: CGFloat) -> CGFloat { clamp((t - start) / (end - start)) }
func easeOut(_ x: CGFloat) -> CGFloat { 1 - pow(1 - x, 3) }
/// Léger dépassement puis retour (le logo « rebondit » en apparaissant).
func easeOutBack(_ x: CGFloat) -> CGFloat { let c1: CGFloat = 1.6, c3 = c1 + 1; return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2) }

// MARK: texte (CoreText)

func font(_ name: String, _ size: CGFloat) -> CTFont {
    let f = CTFontCreateWithName(name as CFString, size, nil)
    // Repli si la police n'existe pas sur la machine.
    return (CTFontCopyPostScriptName(f) as String) == name ? f : CTFontCreateWithName("HiraKakuProN-W6" as CFString, size, nil)
}

/// Texte centré horizontalement, `y` mesuré depuis le haut (comme à l'écran).
func drawText(_ ctx: CGContext, _ text: String, font f: CTFont, color c: CGColor, centerX: CGFloat, y: CGFloat, height h: CGFloat, alpha: CGFloat = 1, kern: CGFloat = 0) {
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): f,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): c.copy(alpha: c.alpha * alpha)!,
        NSAttributedString.Key(kCTKernAttributeName as String): kern,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    let width = CTLineGetTypographicBounds(line, nil, nil, nil)
    ctx.textPosition = CGPoint(x: centerX - CGFloat(width) / 2, y: h - y)
    CTLineDraw(line, ctx)
}

func textWidth(_ text: String, _ f: CTFont) -> CGFloat {
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [NSAttributedString.Key(kCTFontAttributeName as String): f]))
    return CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
}

// MARK: logo (même dessin que LogoMark et l'icône de l'app)

func drawLogo(_ ctx: CGContext, center: CGPoint, size: CGFloat, scale: CGFloat, wave: CGFloat, dot: CGFloat) {
    guard scale > 0 else { return }
    ctx.saveGState()
    ctx.translateBy(x: center.x, y: center.y)
    ctx.scaleBy(x: scale, y: -scale) // repère du SVG : origine en haut
    let s = size / 32
    ctx.translateBy(x: -size / 2, y: -size / 2)
    ctx.setFillColor(color(blue700))
    ctx.fillEllipse(in: CGRect(x: s, y: s, width: 30 * s, height: 30 * s))
    if wave > 0 {
        let path = CGMutablePath()
        path.move(to: CGPoint(x: 6 * s, y: 18 * s))
        path.addCurve(to: CGPoint(x: 16 * s, y: 18 * s), control1: CGPoint(x: 9.3 * s, y: 14 * s), control2: CGPoint(x: 12.7 * s, y: 14 * s))
        path.addCurve(to: CGPoint(x: 26 * s, y: 18 * s), control1: CGPoint(x: 19.3 * s, y: 22 * s), control2: CGPoint(x: 22.7 * s, y: 22 * s))
        // Le trait se dessine de gauche à droite (longueur de la courbe ≈ 25 unités).
        let length = 25 * s
        let dashed = path.copy(dashingWithPhase: 0, lengths: [length * wave + 0.01, length * 2])
        ctx.addPath(dashed)
        ctx.setStrokeColor(color(0xffffff))
        ctx.setLineWidth(2.4 * s)
        ctx.setLineCap(.round)
        ctx.strokePath()
    }
    if dot > 0 {
        let r = 2.6 * s * easeOutBack(dot)
        ctx.setFillColor(color(bordeaux))
        ctx.fillEllipse(in: CGRect(x: 23 * s - r, y: 10 * s - r, width: 2 * r, height: 2 * r))
    }
    ctx.restoreGState()
}

// MARK: une image de la carte finale

func drawEndcard(_ ctx: CGContext, w: CGFloat, h: CGFloat, t: CGFloat) {
    let portrait = h > w
    let unit = min(w, h) / 1080 // 1 en 1080 px de large (portrait) ou de haut (paysage)

    // Fond : blanc vers bleu très pâle, puis les vagues du site qui s'élargissent depuis le bas.
    let bg = CGGradient(colorsSpace: space, colors: [color(0xffffff), color(blue50)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(bg, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: 0), options: [])
    let grow = easeOut(phase(t, 0, 2.2))
    ctx.setStrokeColor(color(blue700, 0.08))
    ctx.setLineWidth(5 * unit)
    let waveCenter = CGPoint(x: w / 2, y: -h * 0.35)
    var r: CGFloat = 120 * unit
    while r < max(w, h) * 1.6 {
        let rr = r * (0.7 + 0.3 * grow)
        ctx.strokeEllipse(in: CGRect(x: waveCenter.x - rr, y: waveCenter.y - rr, width: rr * 2, height: rr * 2))
        r += 110 * unit
    }

    // Disposition : en colonne (9:16) ; en paysage, tout est plus ramassé.
    let logoSize = (portrait ? 240 : 200) * unit
    let logoY = h * (portrait ? 0.34 : 0.24)
    drawLogo(ctx, center: CGPoint(x: w / 2, y: h - logoY), size: logoSize,
             scale: easeOutBack(phase(t, 0.3, 1.0)), wave: easeOut(phase(t, 0.8, 1.5)), dot: phase(t, 1.4, 1.8))

    let titleIn = easeOut(phase(t, 1.5, 2.2))
    drawText(ctx, "Clean Work", font: font("AvenirNext-Bold", 120 * unit), color: color(blue800),
             centerX: w / 2, y: logoY + logoSize * 0.5 + (portrait ? 190 : 170) * unit - 30 * unit * (1 - titleIn), height: h, alpha: titleIn)

    let sloganIn = easeOut(phase(t, 2.3, 3.1))
    drawText(ctx, "迷わない毎日へ。", font: font("HiraginoSans-W6", 84 * unit), color: color(blue700),
             centerX: w / 2, y: logoY + logoSize * 0.5 + (portrait ? 340 : 310) * unit, height: h, alpha: sloganIn, kern: 8 * unit)

    // L'adresse du site, discrète, sous le slogan.
    drawText(ctx, "cleanwork.simondepussay.com", font: font("AvenirNext-DemiBold", 46 * unit), color: color(muted),
             centerX: w / 2, y: logoY + logoSize * 0.5 + (portrait ? 470 : 410) * unit, height: h, alpha: easeOut(phase(t, 3.3, 4.0)))

    // Fondu d'entrée depuis le noir (raccord avec le dernier plan).
    let fade = 1 - phase(t, 0, 0.35)
    if fade > 0 {
        ctx.setFillColor(color(0x000000, fade))
        ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    }
}

// MARK: vidéo (AVAssetWriter, H.264)

func renderVideo(width: Int, height: Int, seconds: Double, fps: Int32, to url: URL) throws {
    try? FileManager.default.removeItem(at: url)
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000],
    ])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
    ])
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    let frames = Int(seconds * Double(fps))
    for i in 0..<frames {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
        guard let pb = buffer else { fatalError("pas de tampon d'image") }
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: space, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
        drawEndcard(ctx, w: CGFloat(width), h: CGFloat(height), t: CGFloat(i) / CGFloat(fps))
        CVPixelBufferUnlockBaseAddress(pb, [])
        adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
    }
    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "endcard", code: 1) }
    print("✅ \(url.path)")
}

// MARK: notification (plan 11), à incruster sur l'écran du téléphone

func renderNotification(to url: URL) {
    let w = 1080, h = 420
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let H = CGFloat(h)
    // Bannière d'iOS : blanc presque opaque, grands coins arrondis, ombre douce.
    let card = CGRect(x: 30, y: 30, width: CGFloat(w) - 60, height: H - 60)
    ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 30, color: color(0x000000, 0.25))
    ctx.addPath(CGPath(roundedRect: card, cornerWidth: 54, cornerHeight: 54, transform: nil))
    ctx.setFillColor(color(0xffffff, 0.94))
    ctx.fillPath()
    ctx.setShadow(offset: .zero, blur: 0)
    // Icône de l'app (fond bleu arrondi, vague, point), puis le texte.
    let icon = CGRect(x: card.minX + 40, y: H - card.minY - 40 - 100, width: 100, height: 100)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: icon, cornerWidth: 24, cornerHeight: 24, transform: nil))
    ctx.clip()
    ctx.setFillColor(color(blue700))
    ctx.fill(icon)
    ctx.restoreGState()
    drawLogo(ctx, center: CGPoint(x: icon.midX, y: icon.midY), size: 96, scale: 1, wave: 1, dot: 1)
    let left = icon.maxX + 32
    func line(_ text: String, _ f: CTFont, _ c: CGColor, _ yTop: CGFloat) {
        let attrs: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): f, NSAttributedString.Key(kCTForegroundColorAttributeName as String): c]
        ctx.textPosition = CGPoint(x: left, y: H - yTop)
        CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs)), ctx)
    }
    line("CLEAN WORK", font("HiraginoSans-W6", 30), color(muted), 108)
    // « 今 » aligné à droite, comme l'heure d'une notification d'iOS.
    let nowFont = font("HiraginoSans-W3", 30)
    let nowAttrs: [NSAttributedString.Key: Any] = [NSAttributedString.Key(kCTFontAttributeName as String): nowFont, NSAttributedString.Key(kCTForegroundColorAttributeName as String): color(muted)]
    ctx.textPosition = CGPoint(x: card.maxX - 50 - textWidth("今", nowFont), y: H - 108)
    CTLineDraw(CTLineCreateWithAttributedString(NSAttributedString(string: "今", attributes: nowAttrs)), ctx)
    line("まもなく面接です", font("HiraginoSans-W6", 44), color(blue950), 168)
    line("株式会社ミライの一次面接まであと1時間。", font("HiraginoSans-W3", 38), color(blue950), 228)
    line("ここまでの準備を信じて、いってらっしゃい！", font("HiraginoSans-W3", 38), color(blue950), 282)
    line("雨の予報です。傘を忘れずに。", font("HiraginoSans-W3", 38), color(bordeaux), 336)
    let image = ctx.makeImage()!
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
    print("✅ \(url.path)")
}

let dir = URL(fileURLWithPath: outDir)
try renderVideo(width: 1080, height: 1920, seconds: 6, fps: 30, to: dir.appending(path: "endcard-9x16.mp4"))
try renderVideo(width: 1920, height: 1080, seconds: 6, fps: 30, to: dir.appending(path: "endcard-16x9.mp4"))
renderNotification(to: dir.appending(path: "notification-9x16.png"))

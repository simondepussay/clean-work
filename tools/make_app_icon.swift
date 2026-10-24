// Dessine l'icône de l'app Clean Work (1024 × 1024, sans transparence, comme l'exige l'App Store) :
// fond bleu (iOS arrondit les coins lui-même), trait de vague blanc, point bordeaux — le logo du site.
//
//   swift tools/make_app_icon.swift ios/ShukatsuPilot/Assets.xcassets/AppIcon.appiconset/AppIcon.png
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let out = CommandLine.arguments.dropFirst().first ?? "AppIcon.png"
let space = CGColorSpace(name: CGColorSpace.sRGB)!
// noneSkipLast : pas de canal alpha.
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
func color(_ hex: Int) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}
let s = CGFloat(size) / 32
// CoreGraphics a l'origine en bas : on retourne pour dessiner comme le SVG (origine en haut).
ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1)

// Fond : dégradé léger du bleu principal vers un bleu plus profond.
let gradient = CGGradient(colorsSpace: space, colors: [color(0x2459a6), color(0x163a6b)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: 0), end: CGPoint(x: CGFloat(size), y: CGFloat(size)), options: [])

// Cercles concentriques très pâles (les « vagues » du fond du site), depuis le bas.
ctx.setStrokeColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.07))
ctx.setLineWidth(10)
for r in stride(from: 180.0, to: 1500.0, by: 150.0) {
    ctx.strokeEllipse(in: CGRect(x: 512 - r, y: 1380 - r, width: r * 2, height: r * 2))
}

// La vague blanche (même courbe que le logo, agrandie).
let wave = CGMutablePath()
wave.move(to: CGPoint(x: 6 * s, y: 18 * s))
wave.addCurve(to: CGPoint(x: 16 * s, y: 18 * s), control1: CGPoint(x: 9.3 * s, y: 14 * s), control2: CGPoint(x: 12.7 * s, y: 14 * s))
wave.addCurve(to: CGPoint(x: 26 * s, y: 18 * s), control1: CGPoint(x: 19.3 * s, y: 22 * s), control2: CGPoint(x: 22.7 * s, y: 22 * s))
ctx.addPath(wave)
ctx.setStrokeColor(color(0xffffff)); ctx.setLineWidth(2.6 * s); ctx.setLineCap(.round)
ctx.strokePath()

// Le point bordeaux, cerclé de blanc pour bien se détacher du bleu.
ctx.setFillColor(color(0xffffff))
ctx.fillEllipse(in: CGRect(x: 19.6 * s, y: 6.6 * s, width: 6.8 * s, height: 6.8 * s))
ctx.setFillColor(color(0x962a3e))
ctx.fillEllipse(in: CGRect(x: 20.4 * s, y: 7.4 * s, width: 5.2 * s, height: 5.2 * s))

let image = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)
print("✅ \(out)")

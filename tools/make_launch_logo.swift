// Dessine le logo de l'écran de lancement iOS (rond bleu, vague blanche, point bordeaux — comme LogoMark),
// sur fond transparent, en 1x, 2x et 3x pour 96 pt. iOS l'affiche au centre, sur fond blanc, avant que l'app démarre.
//
//   swift tools/make_launch_logo.swift ios/ShukatsuPilot/Assets.xcassets/LaunchLogo.imageset
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let folder = CommandLine.arguments.dropFirst().first ?? "LaunchLogo.imageset"
let points = 96
let space = CGColorSpace(name: CGColorSpace.sRGB)!
func color(_ hex: Int) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

for scale in 1...3 {
    let size = points * scale
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let s = CGFloat(size) / 32
    ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1)
    ctx.setFillColor(color(0x1d4f91))
    ctx.fillEllipse(in: CGRect(x: s, y: s, width: 30 * s, height: 30 * s))
    let wave = CGMutablePath()
    wave.move(to: CGPoint(x: 6 * s, y: 18 * s))
    wave.addCurve(to: CGPoint(x: 16 * s, y: 18 * s), control1: CGPoint(x: 9.3 * s, y: 14 * s), control2: CGPoint(x: 12.7 * s, y: 14 * s))
    wave.addCurve(to: CGPoint(x: 26 * s, y: 18 * s), control1: CGPoint(x: 19.3 * s, y: 22 * s), control2: CGPoint(x: 22.7 * s, y: 22 * s))
    ctx.addPath(wave)
    ctx.setStrokeColor(color(0xffffff)); ctx.setLineWidth(2.4 * s); ctx.setLineCap(.round)
    ctx.strokePath()
    ctx.setFillColor(color(0x7b1e2e))
    ctx.fillEllipse(in: CGRect(x: 20.4 * s, y: 7.4 * s, width: 5.2 * s, height: 5.2 * s))

    let name = scale == 1 ? "LaunchLogo.png" : "LaunchLogo@\(scale)x.png"
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "\(folder)/\(name)") as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
    print("✅ \(folder)/\(name)")
}

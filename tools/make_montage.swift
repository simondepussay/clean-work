// Montage de la vidéo de lancement (9:16, 1080×1920) à partir des plans générés par IA :
// coupes, deux phrases en japonais, la notification qui descend, puis la carte finale (make_endcard.swift).
// Le son des plans n'est pas gardé : la musique s'ajoute au montage final.
//
//   swift tools/make_montage.swift marketing/beta-ad
import AVFoundation
import AppKit
import CoreText
import Foundation
import QuartzCore

let dir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "marketing/beta-ad")
let size = CGSize(width: 1080, height: 1920)

/// Un plan : quel fichier, à partir de quand, combien de temps, et le texte éventuel à l'écran.
struct Shot { let file: String; let from: Double; let length: Double; var caption: String? = nil; var notification = false }

let shots: [Shot] = [
    Shot(file: "clips/01-reveil.mp4", from: 1.0, length: 2.6),
    // Elle sort de chez elle en tenue de tous les jours : au début de la journée, pas après le tailleur.
    Shot(file: "clips/09-depart.mp4", from: 1.0, length: 2.2),
    Shot(file: "clips/02-train.mp4", from: 1.0, length: 2.2),
    Shot(file: "clips/03-cours.mp4", from: 1.5, length: 2.0),
    Shot(file: "clips/04-baito.mp4", from: 1.5, length: 2.0),
    Shot(file: "clips/05-entrainement.mp4", from: 1.0, length: 2.8, caption: "家族を、安心させたい。"),
    Shot(file: "clips/06-seule-la-nuit.mp4", from: 1.0, length: 3.2, caption: "全部、ひとりで抱えてた。"),
    Shot(file: "clips/07-tailleur.mp4", from: 1.0, length: 2.4),
    Shot(file: "clips/08-notification.mp4", from: 0.5, length: 5.5, notification: true),
    Shot(file: "endcard-9x16.mp4", from: 0, length: 6.0),
]

let composition = AVMutableComposition()
let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
var cursor = CMTime.zero
var starts: [Double] = []

for shot in shots {
    let asset = AVURLAsset(url: dir.appending(path: shot.file))
    guard let source = asset.tracks(withMediaType: .video).first else { fatalError("pas de vidéo dans \(shot.file)") }
    let range = CMTimeRange(start: CMTime(seconds: shot.from, preferredTimescale: 600), duration: CMTime(seconds: shot.length, preferredTimescale: 600))
    try track.insertTimeRange(range, of: source, at: cursor)
    // Chaque plan remplit tout le cadre 1080×1920 (les plans IA font 720×1280).
    let natural = source.naturalSize
    let scale = max(size.width / natural.width, size.height / natural.height)
    let dx = (size.width - natural.width * scale) / 2, dy = (size.height - natural.height * scale) / 2
    layerInstruction.setTransform(source.preferredTransform.concatenating(CGAffineTransform(scaleX: scale, y: scale)).concatenating(CGAffineTransform(translationX: dx, y: dy)), at: cursor)
    starts.append(CMTimeGetSeconds(cursor))
    cursor = CMTimeAdd(cursor, range.duration)
}

let instruction = AVMutableVideoCompositionInstruction()
instruction.timeRange = CMTimeRange(start: .zero, duration: cursor)
instruction.layerInstructions = [layerInstruction]
let videoComposition = AVMutableVideoComposition()
videoComposition.renderSize = size
videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
videoComposition.instructions = [instruction]

// MARK: textes et notification (Core Animation par-dessus la vidéo)

let parent = CALayer(), videoLayer = CALayer()
parent.frame = CGRect(origin: .zero, size: size)
videoLayer.frame = parent.frame
parent.addSublayer(videoLayer)

/// Une ligne de texte japonais en image (blanc, ombre douce), centrée.
func captionImage(_ text: String, width: CGFloat, height: CGFloat) -> CGImage {
    let ctx = CGContext(data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let font = CTFontCreateWithName("HiraginoSans-W6" as CFString, 68, nil)
    let attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1),
        NSAttributedString.Key(kCTKernAttributeName as String): 6,
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    let lineWidth = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
    ctx.setShadow(offset: .zero, blur: 18, color: CGColor(gray: 0, alpha: 0.75))
    ctx.textPosition = CGPoint(x: (width - lineWidth) / 2, y: height / 2 - 24)
    CTLineDraw(line, ctx)
    return ctx.makeImage()!
}

/// Fondu d'entrée et de sortie entre `start` et `end` (secondes dans la vidéo).
func fade(_ layer: CALayer, start: Double, end: Double, inTime: Double = 0.35, outTime: Double = 0.35) {
    layer.opacity = 0
    let a = CAKeyframeAnimation(keyPath: "opacity")
    a.values = [0, 1, 1, 0]
    let total = end - start
    a.keyTimes = [0, NSNumber(value: inTime / total), NSNumber(value: (total - outTime) / total), 1]
    a.beginTime = AVCoreAnimationBeginTimeAtZero + start
    a.duration = total
    a.isRemovedOnCompletion = false
    a.fillMode = .forwards
    layer.add(a, forKey: "fade")
}

for (i, shot) in shots.enumerated() {
    let start = starts[i], end = start + shot.length
    if let caption = shot.caption {
        // Sous-titre blanc avec une ombre douce, centré en bas (lisible sur tous les fonds).
        // Dessiné en image : un CATextLayer ne survit pas à l'export vidéo sur macOS.
        let text = CALayer()
        text.contents = captionImage(caption, width: size.width - 120, height: 160)
        text.frame = CGRect(x: 60, y: 280, width: size.width - 120, height: 160)
        fade(text, start: start + 0.2, end: end)
        parent.addSublayer(text)
    }
    if shot.notification, let image = NSImage(contentsOf: dir.appending(path: "notification-9x16.png"))?.cgImage(forProposedRect: nil, context: nil, hints: nil) {
        // La notification descend du haut de l'écran, comme sur iOS, puis reste jusqu'à la fin du plan.
        let width: CGFloat = 1000, height = width * CGFloat(image.height) / CGFloat(image.width)
        let banner = CALayer()
        banner.contents = image
        banner.frame = CGRect(x: (size.width - width) / 2, y: size.height - 170 - height, width: width, height: height)
        let appear = start + 0.8
        fade(banner, start: appear, end: end, inTime: 0.25, outTime: 0.3)
        let drop = CABasicAnimation(keyPath: "position.y")
        drop.fromValue = banner.position.y + 260
        drop.toValue = banner.position.y
        drop.beginTime = AVCoreAnimationBeginTimeAtZero + appear
        drop.duration = 0.45
        drop.timingFunction = CAMediaTimingFunction(name: .easeOut)
        drop.fillMode = .backwards
        banner.add(drop, forKey: "drop")
        parent.addSublayer(banner)
    }
}
videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)

// MARK: export

let out = dir.appending(path: "montage-9x16.mp4")
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { fatalError("export impossible") }
export.outputURL = out
export.outputFileType = .mp4
export.videoComposition = videoComposition
let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()
if export.status != .completed { fatalError("export : \(export.error?.localizedDescription ?? "échec")") }
print("✅ \(out.path) — \(String(format: "%.1f", CMTimeGetSeconds(cursor))) s")

// Montage de la vidéo de lancement (9:16, 1080×1920) à partir des plans générés par IA :
// coupes, phrases en japonais (à l'écran et dites), la notification qui descend, puis la carte finale (make_endcard.swift).
// Le son des plans n'est pas gardé : la musique s'ajoute au montage final.
//
// Voix : seulement des enregistrements, marketing/beta-ad/voix/1 … 4 (.m4a, .wav, .mp3) ; sans eux, pas de voix
// (les voix de synthèse du Mac ont été écartées : trop plates pour la pub).
//   1 忙しくて、  2 家族を、安心させたい。  3 全部、ひとりで抱えてた。  4 迷わない毎日へ。
//
// Musique : marketing/beta-ad/musique.mp3 (ou .m4a, .wav), ou MUSIC=chemin pour un essai. Son volume suit le récit :
// il baisse sous chaque phrase dite, presque silence juste avant la notification, remonte pendant, plein sur la carte finale.
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
struct Shot {
    let file: String; let from: Double; let length: Double
    var caption: String? = nil
    /// Le texte reste affiché jusqu'à la fin de ce plan-là (index dans `shots`) : une phrase sur plusieurs plans.
    var captionThrough: Int? = nil
    var notification = false
    /// Phrase dite (numéro du fichier voix/N.m4a s'il existe) et moment où elle commence dans le plan.
    var voice: (number: Int, text: String, at: Double)? = nil
}

let shots: [Shot] = [
    // « 忙しくて、 » s'accumule pendant que la journée s'emballe : une fois, deux fois, trois fois (plans 0 à 4).
    Shot(file: "clips/01-reveil.mp4", from: 1.0, length: 2.6, caption: "忙しくて、", captionThrough: 1, voice: (1, "忙しくて、", 0.6)),
    // Elle sort de chez elle en tenue de tous les jours : au début de la journée, pas après le tailleur.
    Shot(file: "clips/09-depart.mp4", from: 1.0, length: 2.2),
    Shot(file: "clips/02-train.mp4", from: 1.0, length: 2.2, caption: "忙しくて、忙しくて、", captionThrough: 3, voice: (1, "忙しくて、", 0.3)),
    Shot(file: "clips/03-cours.mp4", from: 1.5, length: 2.0),
    Shot(file: "clips/04-baito.mp4", from: 1.5, length: 2.0, caption: "忙しくて、忙しくて、忙しくて、", voice: (1, "忙しくて、", 0.2)),
    Shot(file: "clips/05-entrainement.mp4", from: 1.0, length: 2.8, caption: "家族を、安心させたい。", voice: (2, "家族を、安心させたい。", 0.3)),
    Shot(file: "clips/06-seule-la-nuit.mp4", from: 1.0, length: 3.2, caption: "全部、ひとりで抱えてた。", voice: (3, "全部、ひとりで抱えてた。", 0.3)),
    Shot(file: "clips/07-tailleur.mp4", from: 1.0, length: 2.4),
    Shot(file: "clips/08-notification.mp4", from: 0.5, length: 5.5, notification: true),
    // Le slogan apparaît sur la carte finale vers 2,3 s : la voix le dit à ce moment-là.
    Shot(file: "endcard-9x16.mp4", from: 0, length: 6.0, voice: (4, "迷わない毎日へ。", 2.4)),
]

/// L'enregistrement de la phrase s'il existe (voix/N.m4a…), sinon rien.
func voiceFile(_ number: Int) -> URL? {
    ["m4a", "wav", "mp3", "aiff"].map { dir.appending(path: "voix/\(number).\($0)") }
        .first { FileManager.default.fileExists(atPath: $0.path) }
}

let composition = AVMutableComposition()
let track = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: track)
let voiceTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
// (la piste reste vide tant qu'il n'y a pas d'enregistrement : elle est retirée avant l'export)
var cursor = CMTime.zero
var starts: [Double] = []
/// Moments où la voix parle (début, fin) : la musique baisse en dessous.
var spoken: [(Double, Double)] = []

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
    if let voice = shot.voice, let file = voiceFile(voice.number) {
        let audio = AVURLAsset(url: file)
        if let source = audio.tracks(withMediaType: .audio).first {
            let at = CMTimeAdd(cursor, CMTime(seconds: voice.at, preferredTimescale: 600))
            try voiceTrack.insertTimeRange(CMTimeRange(start: .zero, duration: audio.duration), of: source, at: at)
            spoken.append((CMTimeGetSeconds(at), CMTimeGetSeconds(at) + CMTimeGetSeconds(audio.duration)))
        }
    }
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
    // 68 pt, ou plus petit si la ligne est trop longue pour l'écran (« 忙しくて、» trois fois).
    func line(_ pt: CGFloat) -> CTLine {
        let attrs: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): CTFontCreateWithName("HiraginoSans-W6" as CFString, pt, nil),
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 1, alpha: 1),
            NSAttributedString.Key(kCTKernAttributeName as String): pt * 0.09,
        ]
        return CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    }
    let natural = CGFloat(CTLineGetTypographicBounds(line(68), nil, nil, nil))
    let line = line(min(68, 68 * (width - 40) / natural))
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
    let start = starts[i]
    let end = shot.captionThrough.map { starts[$0] + shots[$0].length } ?? start + shot.length
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

// MARK: musique et volume

let total = CMTimeGetSeconds(cursor)
let musicURL = ProcessInfo.processInfo.environment["MUSIC"].map { URL(fileURLWithPath: $0) }
    ?? ["mp3", "m4a", "wav"].map { dir.appending(path: "musique.\($0)") }.first { FileManager.default.fileExists(atPath: $0.path) }
var audioMix: AVMutableAudioMix?
// L'asset est gardé dans une variable : une piste ne retient pas son asset, qui sinon disparaît avant le découpage (erreur -12780).
let musicAsset = musicURL.map { AVURLAsset(url: $0, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true]) }
if let musicURL, let music = musicAsset?.tracks(withMediaType: .audio).first {
    let musicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
    // La chanson commence à 10 s de son début (MUSIC_START pour changer).
    let offset = Double(ProcessInfo.processInfo.environment["MUSIC_START"] ?? "10") ?? 10
    let length = min(CMTimeGetSeconds(music.timeRange.duration) - offset, total)
    try musicTrack.insertTimeRange(CMTimeRange(start: CMTimeAdd(music.timeRange.start, CMTime(seconds: offset, preferredTimescale: 600)),
                                               duration: CMTime(seconds: length - 0.05, preferredTimescale: 600)), of: music, at: .zero)

    // Courbe de volume : une suite de points (moment, niveau), reliés par des rampes.
    // Musique discrète : la voix doit rester nettement devant.
    let full: Float = 0.45, under: Float = 0.1, breath: Float = 0.04
    let notification = starts[shots.firstIndex { $0.notification }!]
    let endcard = starts[shots.count - 1]
    /// Niveau de fond selon le moment : plein pendant la journée, plus bas pendant la notification, plein à la fin.
    func base(_ t: Double) -> Float { t < notification ? full : t < endcard ? 0.3 : 0.55 }
    var points: [(Double, Float)] = [(0, 0), (0.6, full)]
    for (from, to) in spoken {
        points += [(from - 0.2, base(from)), (from, under), (to, under), (to + 0.4, base(to))]
    }
    // Juste avant la notification : presque le silence, puis la musique remonte doucement pendant le plan.
    points.append((notification - 0.6, full))
    points.append((notification, breath))
    points.append((notification + 1.2, breath))
    points.append((endcard - 0.2, 0.35))
    points.append((endcard + 0.4, 0.55))
    points.append((total - 1.2, 0.55))
    points.append((total, 0))
    points.sort { $0.0 < $1.0 }

    let params = AVMutableAudioMixInputParameters(track: musicTrack)
    for (a, b) in zip(points, points.dropFirst()) where b.0 > a.0 {
        params.setVolumeRamp(fromStartVolume: a.1, toEndVolume: b.1,
                             timeRange: CMTimeRange(start: CMTime(seconds: a.0, preferredTimescale: 600), end: CMTime(seconds: b.0, preferredTimescale: 600)))
    }
    let mix = AVMutableAudioMix()
    mix.inputParameters = [params]
    audioMix = mix
    print("musique : \(musicURL.lastPathComponent)\(length < total ? String(format: " (plus courte que la vidéo : %.1f s)", length) : "")")
}

// MARK: export

if voiceTrack.segments.isEmpty { composition.removeTrack(voiceTrack) }

let out = dir.appending(path: "montage-9x16.mp4")
try? FileManager.default.removeItem(at: out)
guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else { fatalError("export impossible") }
export.outputURL = out
export.outputFileType = .mp4
export.videoComposition = videoComposition
export.audioMix = audioMix
let done = DispatchSemaphore(value: 0)
export.exportAsynchronously { done.signal() }
done.wait()
if export.status != .completed { fatalError("export : \(export.error?.localizedDescription ?? "échec")") }
print("✅ \(out.path) — \(String(format: "%.1f", CMTimeGetSeconds(cursor))) s")

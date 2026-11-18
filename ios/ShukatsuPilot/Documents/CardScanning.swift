import SwiftUI
import UIKit
import Vision
import VisionKit

/// Le scanner de documents d'iOS (cadrage automatique, redressement de la carte), présenté en plein écran.
struct CardScanner: UIViewControllerRepresentable {
    var onScan: (UIImage) -> Void
    var onCancel: () -> Void

    static var isAvailable: Bool { VNDocumentCameraViewController.isSupported }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let controller = VNDocumentCameraViewController()
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: CardScanner
        init(_ parent: CardScanner) { self.parent = parent }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            // Une carte = la première page ; les suivantes (verso…) sont ignorées.
            if scan.pageCount > 0 { parent.onScan(scan.imageOfPage(at: 0)) } else { parent.onCancel() }
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) { parent.onCancel() }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) { parent.onCancel() }
    }
}

/// Lecture du texte de la carte, sur l'iPhone (Vision) : japonais et anglais, ligne par ligne de haut en bas.
enum CardTextReader {
    static func text(in image: UIImage) async -> String {
        guard let cgImage = image.cgImage else { return "" }
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        // Hors du fil principal : la lecture prend une à deux secondes.
        return await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ja-JP", "en-US"]
            request.usesLanguageCorrection = true
            guard (try? VNImageRequestHandler(cgImage: cgImage, orientation: orientation).perform([request])) != nil else { return "" }
            // Vision compte y depuis le bas : on trie du haut vers le bas, puis de gauche à droite.
            return (request.results ?? [])
                .sorted { abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.02 ? $0.boundingBox.midY > $1.boundingBox.midY : $0.boundingBox.minX < $1.boundingBox.minX }
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n")
        }.value
    }
}

/// Si l'IA n'est pas disponible : ce qui se reconnaît sans elle (e-mail, téléphones, site).
enum LocalCardParser {
    static func fields(from text: String) -> CardFields {
        var fields = CardFields()
        let lines = text.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespaces) }
        func first(_ pattern: String, in s: String) -> String? {
            guard let range = s.range(of: pattern, options: [.regularExpression, .caseInsensitive]) else { return nil }
            return String(s[range])
        }
        fields.email = first(#"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}"#, in: text) ?? ""
        fields.website = lines.compactMap { first(#"(https?://)?(www\.)[^\s]+"#, in: $0) }.first ?? ""
        let phone = #"\+?\d[\d\-\s()]{8,}\d"#
        for line in lines {
            guard let number = first(phone, in: line) else { continue }
            let lower = line.lowercased()
            if lower.contains("fax") { continue }
            if (lower.contains("mobile") || line.contains("携帯") || number.hasPrefix("090") || number.hasPrefix("080") || number.hasPrefix("070")), fields.mobile.isEmpty {
                fields.mobile = number
            } else if fields.phone.isEmpty {
                fields.phone = number
            }
        }
        fields.company = lines.first { $0.contains("株式会社") || $0.contains("有限会社") || $0.range(of: #"\b(Inc|Ltd|Co\.|Corporation|K\.K\.)"#, options: .regularExpression) != nil } ?? ""
        return fields
    }
}

/// La photo envoyée au serveur : réduite (1000 px de large) et compressée pour rester sous la limite de l'API.
enum CardPhoto {
    static let maxBase64 = 220_000

    static func jpeg(_ image: UIImage) -> Data? {
        let width: CGFloat = 1000
        let scale = min(1, width / max(image.size.width, 1))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        for quality in stride(from: 0.7, through: 0.2, by: -0.1) {
            if let data = resized.jpegData(compressionQuality: quality), data.count * 4 / 3 < maxBase64 { return data }
        }
        return nil
    }
}

private extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

import AVFoundation
import Foundation
import Observation
import Speech

/// Reconnaissance vocale en japonais pour répondre à l'oral (S18).
///
/// La voix ne passe jamais par notre serveur : c'est iOS qui la transforme en texte,
/// sur l'iPhone lui-même quand il en est capable (`requiresOnDeviceRecognition`),
/// sinon avec le service d'Apple. Seul le texte est envoyé à l'API.
@MainActor
@Observable
final class SpeechRecognizer {
    enum State: Equatable { case idle, listening, denied, unavailable }

    private(set) var state: State = .idle
    /// Texte reconnu depuis le début de l'écoute (définitif + provisoire).
    private(set) var transcript = ""
    /// Durée de la dernière écoute, en secondes.
    private(set) var duration: Int?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var startedAt: Date?

    var isAvailable: Bool { recognizer?.isAvailable ?? false }

    /// Demande les deux autorisations (reconnaissance et micro) au premier usage, puis écoute.
    func start() async {
        guard let recognizer, recognizer.isAvailable else { state = .unavailable; return }
        let speech = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
        let mic = await AVAudioApplication.requestRecordPermission()
        guard speech == .authorized, mic else { state = .denied; return }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            request.addsPunctuation = true
            // Sur l'iPhone quand c'est possible : la voix ne quitte pas l'appareil.
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                request.append(buffer)
            }
            engine.prepare()
            try engine.start()

            transcript = ""
            duration = nil
            startedAt = .now
            state = .listening
            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                let text = result?.bestTranscription.formattedString
                let done = error != nil || (result?.isFinal ?? false)
                Task { @MainActor in
                    guard let self else { return }
                    if let text { self.transcript = text }
                    if done { self.stop() }
                }
            }
        } catch {
            stop()
            state = .unavailable
        }
    }

    func stop() {
        guard state == .listening else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        if let startedAt { duration = Int(Date.now.timeIntervalSince(startedAt).rounded()) }
        startedAt = nil
        state = .idle
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// Lit la question à voix haute, avec une voix japonaise, comme un vrai recruteur.
@MainActor
final class QuestionReader {
    private let synthesizer = AVSpeechSynthesizer()

    func read(_ text: String) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "ja-JP")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.95
        synthesizer.speak(utterance)
    }

    func stop() { synthesizer.stopSpeaking(at: .immediate) }
}

/**
 * Voix dans le navigateur (S18) : reconnaissance vocale pour répondre, synthèse vocale pour
 * entendre la question comme dans un vrai entretien. Rien ne passe par notre serveur :
 * c'est le navigateur qui s'en charge (Chrome envoie l'audio à Google, Safari à Apple ;
 * c'est écrit dans la politique de confidentialité). Sans reconnaissance (Firefox…), on tape.
 */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => Recognition;

function recognitionClass(): RecognitionConstructor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => recognitionClass() !== null;
export const canSpeak = () => typeof globalThis.speechSynthesis !== "undefined" && typeof globalThis.SpeechSynthesisUtterance !== "undefined";

export type Listener = { stop(): void };

/**
 * Écoute en japonais. `onText` reçoit le texte reconnu jusqu'ici (définitif + provisoire),
 * `onEnd` est appelé quand l'écoute s'arrête (bouton, silence prolongé ou erreur).
 */
export function listen(onText: (text: string) => void, onEnd: (error?: string) => void): Listener | null {
  const Rec = recognitionClass();
  if (!Rec) return null;
  const rec = new Rec();
  rec.lang = "ja-JP";
  rec.continuous = true;
  rec.interimResults = true;
  let finalText = "";
  let failure: string | undefined;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    onText(finalText + interim);
  };
  rec.onerror = (e) => { failure = e.error; };
  rec.onend = () => onEnd(failure);
  rec.start();
  return { stop: () => rec.stop() };
}

/** Lit la question à voix haute, avec une voix japonaise si le système en a une. */
export function speak(text: string) {
  if (!canSpeak()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
  if (voice) u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };

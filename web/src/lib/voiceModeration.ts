import { useEffect, useRef } from 'react';
import { api } from './api';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceModerationSupported(): boolean {
  return Boolean(recognitionCtor());
}

/**
 * Voice moderation bridge (opt-in, on-device speech-to-text).
 *
 * The user explicitly enables it before speaking. Speech is transcribed in the
 * browser (nothing is uploaded except short text snippets) and each snippet is
 * checked by the server, which can force-mute the mic and apply the penalty
 * ladder. Without the toggle nothing is captured — that is the privacy consent.
 */
export function useVoiceModeration(options: {
  roomId: string;
  enabled: boolean;
  onFlagged: (reason: string | null) => void;
}) {
  const { roomId, enabled, onFlagged } = options;
  const callbackRef = useRef(onFlagged);
  callbackRef.current = onFlagged;

  useEffect(() => {
    if (!enabled || !roomId) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    let stopped = false;
    let recognition: SpeechRecognitionLike | null = null;

    const begin = () => {
      recognition = new Ctor();
      recognition.lang = 'ar-IQ';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const transcript = event.results[index]?.[0]?.transcript?.trim();
          if (!transcript || transcript.length < 2) continue;
          void api<{ muted: boolean; reason: string | null }>('/security/voice-transcript', {
            method: 'POST',
            body: { roomId, transcript },
          })
            .then((result) => {
              if (result?.muted) callbackRef.current(result.reason);
            })
            .catch(() => {
              // A blocked/suspended mic simply stops the monitor.
            });
        }
      };
      recognition.onerror = () => {};
      recognition.onend = () => {
        if (!stopped) {
          try {
            recognition?.start();
          } catch {
            // The browser refused a restart (permission lost) — stop quietly.
          }
        }
      };
      try {
        recognition.start();
      } catch {
        // Already running.
      }
    };

    begin();
    return () => {
      stopped = true;
      try {
        recognition?.stop();
      } catch {
        // Ignore a stop on an already-closed recognizer.
      }
      recognition = null;
    };
  }, [enabled, roomId]);
}

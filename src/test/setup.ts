import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// jsdom لا يوفّر مِيكروفونًا حقيقيًا؛ نمنح الاختبارات جهازًا وهميًا افتراضيًا
// حتى يمكن اختبار تفعيل الصوت، مع إمكانية استبداله برفض الإذن في اختبارات محددة.
const audioTrack = { kind: 'audio', enabled: true, stop: vi.fn() }
const audioStream = {
  getAudioTracks: () => [audioTrack],
  getTracks: () => [audioTrack],
}

Object.defineProperty(navigator, 'mediaDevices', {
  configurable: true,
  value: { getUserMedia: vi.fn().mockResolvedValue(audioStream) },
})

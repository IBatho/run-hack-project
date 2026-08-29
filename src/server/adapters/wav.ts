/**
 * Tiny offline "voice" synthesiser used by the mock ElevenLabs adapter so the
 * demo actually plays audible audio without any credentials. It maps the roast
 * text to a sequence of vowel-ish formant tones with an amplitude envelope,
 * which sounds like muffled speech rather than a flat beep.
 */

const SAMPLE_RATE = 22_050;
const VOWEL_FORMANTS: Array<[number, number]> = [
  [700, 1220], // a
  [400, 1900], // e
  [300, 2400], // i
  [450, 900], // o
  [340, 800], // u
];

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

export function estimateSpeechDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.round(Math.max(600, (words / 2.6) * 1000));
}

/** Renders `text` into a mono 16-bit PCM WAV buffer. */
export function synthesizeWav(text: string): Buffer {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const seed = hash(text);
  const durationMs = estimateSpeechDurationMs(text);
  const totalSamples = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const samples = new Int16Array(totalSamples);
  const syllables = Math.max(1, Math.round(words.length * 1.4));
  const samplesPerSyllable = Math.max(1, Math.floor(totalSamples / syllables));

  for (let i = 0; i < totalSamples; i += 1) {
    const syllable = Math.min(syllables - 1, Math.floor(i / samplesPerSyllable));
    const [f1, f2] = VOWEL_FORMANTS[(seed + syllable) % VOWEL_FORMANTS.length];
    const posInSyllable = (i % samplesPerSyllable) / samplesPerSyllable;
    // Attack/decay envelope with a short silent gap between syllables.
    const envelope = posInSyllable > 0.82 ? 0 : Math.sin(Math.PI * (posInSyllable / 0.82));
    const t = i / SAMPLE_RATE;
    const pitch = 110 + ((seed + syllable) % 40);
    const voiced =
      0.55 * Math.sin(2 * Math.PI * pitch * t) +
      0.3 * Math.sin(2 * Math.PI * f1 * t) +
      0.15 * Math.sin(2 * Math.PI * f2 * t);
    samples[i] = Math.round(voiced * envelope * 12_000);
  }

  const dataSize = samples.length * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, dataSize)]);
}

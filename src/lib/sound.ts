type SoundKey = "dice" | "ui" | "card";

const soundSources: Record<SoundKey, string> = {
  dice: "/assets/audio/dice-roll.mp3",
  ui: "/assets/audio/ui-click.wav",
  card: "/assets/audio/card-flip.wav",
};

const audioInstances: Partial<Record<SoundKey, HTMLAudioElement>> = {};
const failedSounds: Set<SoundKey> = new Set();

const getAudio = (key: SoundKey) => {
  if (typeof window === "undefined" || typeof Audio === "undefined") {
    return undefined;
  }

  if (!audioInstances[key]) {
    const audio = new Audio(soundSources[key]);
    audio.preload = "auto";
    audioInstances[key] = audio;
  }

  return audioInstances[key];
};

export const playSound = (key: SoundKey) => {
  const audio = getAudio(key);
  if (!audio) return;

  if (failedSounds.has(key)) return;

  audio.currentTime = 0;
  // audio.play() returns a promise which may reject on some browsers (autoplay / unsupported codecs)
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.then === "function") {
    playPromise.catch((err) => {
      // Remember failure and avoid repeated attempts for this key.
      failedSounds.add(key);
      // Silently ignore in production, but log once in dev for debugging.
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`Audio play failed (key=${key}):`, err);
      }
    });
  }
};

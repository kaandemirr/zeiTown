type SoundKey = "dice" | "ui" | "card";

const soundSources: Record<SoundKey, string> = {
  dice: "/assets/audio/dice-roll.mp3",
  ui: "/assets/audio/ui-click.wav",
  card: "/assets/audio/card-flip.wav",
};

const audioInstances: Partial<Record<SoundKey, HTMLAudioElement>> = {};

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

  try {
    audio.currentTime = 0;
    void audio.play();
  } catch {
    // ignore autoplay restrictions
  }
};

// Story photography used across the app. Files live in public/images/ (web-
// optimised WebP exported from the originals in /assets). `position` is the
// CSS object-position that keeps the subject in frame when a photo is cropped
// into a wide banner.
export interface StoryImage {
  src: string;
  alt: string;
  width: number;
  height: number;
  position: string;
}

export const STORY_IMAGES = {
  handsRaised: {
    src: '/images/hands-raised.webp',
    alt: 'Villagers at sunrise raising their hands, some holding handwritten applications',
    width: 1920,
    height: 822,
    position: '60% 40%',
  },
  waitingOffice: {
    src: '/images/waiting-office.webp',
    alt: 'An elderly man sits with his file on the steps of a block office while a long queue waits at the counter',
    width: 1600,
    height: 900,
    position: '30% 40%',
  },
  beforeUnheard: {
    src: '/images/before-unheard.webp',
    alt: 'A villager sits on a charpai by lantern light, reading a crumpled complaint letter',
    width: 786,
    height: 992,
    position: '50% 40%',
  },
  afterKiosk: {
    src: '/images/after-kiosk.webp',
    alt: 'The same villager smiles holding his receipt at a CSC kiosk as the operator confirms his grievance',
    width: 786,
    height: 992,
    position: '50% 35%',
  },
  voiceHandpump: {
    src: '/images/voice-handpump.webp',
    alt: 'A woman beside a dry hand pump records her complaint on a phone in her own language',
    width: 960,
    height: 1200,
    position: '40% 18%',
  },
  waterOfHope: {
    src: '/images/water-of-hope.webp',
    alt: 'Women and children fill pots at a repaired hand pump while an elder thanks a government engineer',
    width: 1600,
    height: 900,
    position: '50% 45%',
  },
} satisfies Record<string, StoryImage>;

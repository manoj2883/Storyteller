export type Story = {
  id: string;
  title: string;
  source: "interview" | "pasted" | "extracted";
  rawTranscript: string;
  beats: {
    hook: string;
    stakes: string;        // what happens if this goes wrong
    obstacle: string;
    turn: string;          // the moment it changes
    payoff: string;
    landingLine: string;   // under 12 words, repeatable by a stranger
  };
  emotion: string;
  lesson: string;          // one sentence — what this story is FOR
  durations: { "30s": string; "2min": string; "5min": string };
  themes: string[];
  concreteImage: string;   // the single visual the audience keeps
  reps: number;
  lastTold: string;
  bestTakeAudio?: Blob;
  laughPoints: { at: string; device: string }[];
};

export type Bit = {
  id: string;
  setup: string;
  line: string;
  topics: string[];
  device: "callback" | "rule_of_three" | "contrast" | "understatement" | "false_precision" | "self_deprecation" | "misdirection";
  reps: number;
};

export type SessionMode = "live" | "rehearsal" | "interview";

export type SessionMetrics = {
  wpm: number;
  fillerCount: number;
  fillerDensity: number; // fillers per 100 words over 30s
  pauseCount: number;
  avgPauseSec: number;
  flatStretchWindows: { startSec: number; endSec: number; reason: string }[];
};

export type TranscriptItem = {
  id: string;
  speaker: "user" | "coach" | "system";
  text: string;
  timestampMs: number;
  isInterim?: boolean;
};

export type EvidencedScore = {
  score: number; // 0-100
  evidenceQuote: string;
  timestamp: string;
  explanation: string;
};

export type TeardownReport = {
  id: string;
  sessionId: string;
  createdAt: string;
  mode: SessionMode;
  durationSec: number;
  compositeScore: number;
  scores: {
    storyStructure: EvidencedScore;  // weight 35
    delivery: EvidencedScore;        // weight 30
    registerPhrasing: EvidencedScore;// weight 25
    witLightness: EvidencedScore;    // weight 10
  };
  theOneThing: string;
  structureTeardown: {
    storyName?: string;
    missingBeats: string[];
    suggestedLandingLine?: string;
    analysis: string;
  }[];
  deliveryTeardown: {
    fillerRatePerMin: number;
    last5AvgFillerRate: number;
    paceRunawayTimestamps: string[];
    missedPauseTimestamps: string[];
  };
  registerTeardown: {
    originalText: string;
    nativeAlternative1: string;
    nativeAlternative2: string;
    contextAndRegister: string;
  }[];
  lightnessTeardown: {
    missingBeatTimestamps: string[];
    suggestedBitLine?: string;
  };
  tomorrowDrill: string;
};

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "chunking" | "failed" | "error";

/**
 * Pure Heuristic Retention Engine
 * Detects 90+ second flat-stretch drop-off windows without model calls
 */

export interface TranscriptEntry {
  text: string;
  timestampSec: number;
}

export interface FlatStretchWindow {
  startSec: number;
  endSec: number;
  reason: string;
}

const CONCRETE_EXAMPLE_REGEX = /\b(for example|for instance|specifically|take|such as|case in point|case|picture this|imagine)\b/i;
const NAMED_PERSON_REGEX = /\b([A-Z][a-z]+|boss|manager|client|customer|colleague|friend|mother|father|brother|sister|doctor|engineer)\b/;
const NUMBER_REGEX = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|percent|first|second|third)\b/i;
const QUESTION_REGEX = /\?|\b(have you ever|what if|how many|why do we|who here|can you)\b/i;
const STORY_BEAT_REGEX = /\b(suddenly|then|instead|the problem was|until|the result|finally|turns out|what happened was|at that point)\b/i;
const LIGHTNESS_REGEX = /\b(funny|joke|hilarious|laugh|kidding|ironic|weirdly|oddly enough|strangely)\b/i;
const SIGNPOST_REGEX = /\b(here's the thing|bottom line|the point is|most importantly|key takeaway|remember this|listen|pay attention)\b/i;

export function detectFlatStretches(
  transcripts: TranscriptEntry[],
  totalSessionDurationSec: number
): FlatStretchWindow[] {
  if (totalSessionDurationSec < 90 || transcripts.length === 0) {
    return [];
  }

  const flatWindows: FlatStretchWindow[] = [];
  const WINDOW_SIZE_SEC = 90;
  const STEP_SEC = 15;

  for (let start = 0; start <= totalSessionDurationSec - WINDOW_SIZE_SEC; start += STEP_SEC) {
    const end = start + WINDOW_SIZE_SEC;

    // Gather transcript entries in [start, end]
    const windowTexts = transcripts
      .filter((t) => t.timestampSec >= start && t.timestampSec <= end)
      .map((t) => t.text)
      .join(' ');

    if (!windowTexts || windowTexts.trim().length === 0) {
      continue;
    }

    const hasConcrete = CONCRETE_EXAMPLE_REGEX.test(windowTexts);
    const hasNamedPerson = NAMED_PERSON_REGEX.test(windowTexts);
    const hasNumber = NUMBER_REGEX.test(windowTexts);
    const hasQuestion = QUESTION_REGEX.test(windowTexts);
    const hasStoryBeat = STORY_BEAT_REGEX.test(windowTexts);
    const hasLightness = LIGHTNESS_REGEX.test(windowTexts);
    const hasSignpost = SIGNPOST_REGEX.test(windowTexts);

    // If none of the 7 retention anchors are present in this 90-second window:
    const isFlat = !hasConcrete && !hasNamedPerson && !hasNumber && !hasQuestion && !hasStoryBeat && !hasLightness && !hasSignpost;

    if (isFlat) {
      // Merge overlapping windows
      const lastWindow = flatWindows[flatWindows.length - 1];
      if (lastWindow && start <= lastWindow.endSec) {
        lastWindow.endSec = end;
      } else {
        flatWindows.push({
          startSec: start,
          endSec: end,
          reason: '90s stretch with no concrete example, named person, number, question, story beat, lightness, or signpost.',
        });
      }
    }
  }

  return flatWindows;
}

/**
 * Chapter plan: intro, one chapter per tour, outro — laid over the frame budget.
 *
 * Timing is expressed in frames, not seconds, because the renderer steps frames.
 * Anything derived from wall-clock time would drift against the output.
 */
import { FPS, TOTAL_FRAMES } from '@/video.ts';

export type ChapterKind = 'intro' | 'tour' | 'outro';

export type Chapter = {
  kind: ChapterKind;
  /** Index into the tour list, or -1 for intro/outro. */
  tourIndex: number;
  start: number;
  /** Exclusive. */
  end: number;
};

export const INTRO_SECONDS = 2.5;
export const OUTRO_SECONDS = 4.5;
/** Frames of cross-fade between neighbouring chapters. */
export const TRANSITION_FRAMES = 12;

export function planChapters(
  tourCount: number,
  totalFrames = TOTAL_FRAMES
): Chapter[] {
  if (tourCount <= 0) {
    throw new Error('planChapters needs at least one tour');
  }
  const intro = Math.round(INTRO_SECONDS * FPS);
  const outro = Math.round(OUTRO_SECONDS * FPS);
  const body = totalFrames - intro - outro;
  if (body <= tourCount) {
    throw new Error(`not enough frames for ${tourCount} tours`);
  }

  const chapters: Chapter[] = [
    { kind: 'intro', tourIndex: -1, start: 0, end: intro }
  ];
  for (let i = 0; i < tourCount; i += 1) {
    // distribute the remainder by rounding boundaries, so no frame is lost
    const start = intro + Math.round((body * i) / tourCount);
    const end = intro + Math.round((body * (i + 1)) / tourCount);
    chapters.push({ kind: 'tour', tourIndex: i, start, end });
  }
  chapters.push({
    kind: 'outro',
    tourIndex: -1,
    start: intro + body,
    end: totalFrames
  });
  return chapters;
}

export function chapterAt(
  chapters: readonly Chapter[],
  frame: number
): Chapter {
  for (const c of chapters) {
    if (frame >= c.start && frame < c.end) {
      return c;
    }
  }
  return chapters[chapters.length - 1]!;
}

/** Progress through a chapter, 0 at its first frame and 1 at its last. */
export function progressIn(chapter: Chapter, frame: number): number {
  const span = chapter.end - chapter.start - 1;
  if (span <= 0) {
    return 1;
  }
  return Math.max(0, Math.min(1, (frame - chapter.start) / span));
}

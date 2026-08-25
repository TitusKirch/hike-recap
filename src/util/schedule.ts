/**
 * Draw schedule for the growing-viewport variant.
 *
 * The camera starts framed on the first tour alone and zooms out step by step:
 * before tour *n* is drawn it pulls back until tours 1…n all fit. So each tour
 * is drawn at the tightest zoom that still shows everything already on screen.
 *
 * Each tour therefore gets two phases:
 *   zoom  — camera pulls back to the new frame, nothing is drawn
 *   draw  — camera holds still, the track draws itself
 *
 * Draw time is proportional to track **length**, never an equal split: equal
 * shares make the head sprint through a long tour and crawl along a short one.
 */

export type TourPhase = {
  index: number;
  /** Camera transition; zero-length for the first tour. */
  zoomStart: number;
  zoomEnd: number;
  drawStart: number;
  /** Exclusive. */
  drawEnd: number;
};

export type SchedulePlan = {
  phases: TourPhase[];
  /** Frame from which the finished map is simply held. */
  holdFrom: number;
};

export type ScheduleOptions = {
  totalFrames: number;
  /** Frames before anything happens. */
  leadIn?: number;
  /** Frames the finished map is held at the end. */
  holdOut?: number;
  /** Frames each zoom-out takes. */
  zoomFrames?: number;
  /**
   * Per tour: does the camera actually move before it? Where the frame is
   * unchanged there is nothing to animate, and those frames go to drawing
   * instead. Index 0 is always false — the camera opens where it opens.
   */
  needsZoom?: readonly boolean[];
};

export function planDrawSchedule(
  lengths: readonly number[],
  options: ScheduleOptions
): SchedulePlan {
  const {
    totalFrames,
    leadIn = 0,
    holdOut = 0,
    zoomFrames = 0,
    needsZoom
  } = options;
  if (lengths.length === 0) {
    throw new Error('planDrawSchedule needs at least one tour');
  }
  // the first tour needs no zoom — the camera opens already framed on it
  const moves = lengths.map((_, i) =>
    i === 0 ? false : (needsZoom?.[i] ?? true)
  );
  const zoomTotal = zoomFrames * moves.filter(Boolean).length;
  const drawable = totalFrames - leadIn - holdOut - zoomTotal;
  if (drawable <= lengths.length) {
    throw new Error(`not enough frames to draw ${lengths.length} tours`);
  }

  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    throw new Error('tour lengths must be positive');
  }

  const phases: TourPhase[] = [];
  let cursor = leadIn;
  let consumed = 0;
  let zoomsSoFar = 0;
  for (let i = 0; i < lengths.length; i += 1) {
    const zoomStart = cursor;
    const zoomEnd = moves[i] ? cursor + zoomFrames : cursor;
    if (moves[i]) {
      zoomsSoFar += 1;
    }
    consumed += lengths[i]!;
    // round against the running total so no frame is lost to accumulation
    const drawEnd =
      leadIn +
      zoomFrames * zoomsSoFar +
      Math.round((drawable * consumed) / total);
    phases.push({
      index: i,
      zoomStart,
      zoomEnd,
      drawStart: zoomEnd,
      drawEnd: Math.max(drawEnd, zoomEnd + 1)
    });
    cursor = phases[i]!.drawEnd;
  }

  return { phases, holdFrom: phases[phases.length - 1]!.drawEnd };
}

/** How much of tour `index` is drawn at `frame`: 0 before, 1 after. */
export function drawnFraction(phase: TourPhase, frame: number): number {
  if (frame <= phase.drawStart) {
    return 0;
  }
  if (frame >= phase.drawEnd) {
    return 1;
  }
  return (frame - phase.drawStart) / (phase.drawEnd - phase.drawStart);
}

export type CameraState = {
  /** Which tour's frame the layers should be rasterised for. */
  target: number;
  /** Which frame we are pulling away from, or -1 when holding still. */
  from: number;
  /** 0 → 1 through the zoom; 1 whenever the camera is at rest. */
  t: number;
};

/** What the camera is doing at `frame`. */
export function cameraAt(plan: SchedulePlan, frame: number): CameraState {
  const { phases } = plan;
  for (const p of phases) {
    if (frame < p.zoomStart) {
      break;
    }
    if (p.zoomEnd > p.zoomStart && frame < p.zoomEnd) {
      return {
        target: p.index,
        from: p.index - 1,
        t: (frame - p.zoomStart) / (p.zoomEnd - p.zoomStart)
      };
    }
    if (frame < p.drawEnd) {
      return { target: p.index, from: -1, t: 1 };
    }
  }
  const last = phases[phases.length - 1]!;
  return frame < phases[0]!.zoomStart
    ? { target: 0, from: -1, t: 1 }
    : { target: last.index, from: -1, t: 1 };
}

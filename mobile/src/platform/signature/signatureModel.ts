export type SignaturePoint = {
  x: number;
  y: number;
  timestamp: number;
};

export type SignatureStroke = {
  id: string;
  points: SignaturePoint[];
};

export type SignatureState = {
  strokes: SignatureStroke[];
  canvas: {
    width: number;
    height: number;
  };
};

export const sampleStroke: SignatureStroke = {
  id: 'sample-stroke-1',
  points: [
    { x: 12, y: 20, timestamp: 1 },
    { x: 48, y: 52, timestamp: 2 },
    { x: 96, y: 44, timestamp: 3 },
  ],
};

export function createEmptySignature(width = 320, height = 160): SignatureState {
  return {
    strokes: [],
    canvas: { width, height },
  };
}

export function createSignatureStroke(id: string, point: SignaturePoint): SignatureStroke {
  return {
    id,
    points: [point],
  };
}

function distanceBetweenPoints(a: SignaturePoint, b: SignaturePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function appendPointToSignatureStroke(
  stroke: SignatureStroke,
  point: SignaturePoint,
  minDistance = 2,
): SignatureStroke {
  const lastPoint = stroke.points.at(-1);

  if (lastPoint && distanceBetweenPoints(lastPoint, point) < minDistance) {
    return stroke;
  }

  return {
    ...stroke,
    points: [...stroke.points, point],
  };
}

export function appendPointToSignature(
  signature: SignatureState,
  strokeId: string,
  point: SignaturePoint,
): SignatureState {
  return {
    ...signature,
    strokes: signature.strokes.map(stroke =>
      stroke.id === strokeId ? appendPointToSignatureStroke(stroke, point) : stroke,
    ),
  };
}

export function canSubmitSignature(signature: SignatureState): boolean {
  return signature.strokes.some(stroke => stroke.points.length > 0);
}

export function addStroke(signature: SignatureState, stroke: SignatureStroke): SignatureState {
  return {
    ...signature,
    strokes: [...signature.strokes, stroke],
  };
}

export function undoStroke(signature: SignatureState): SignatureState {
  return {
    ...signature,
    strokes: signature.strokes.slice(0, -1),
  };
}

export function clearSignature(signature: SignatureState): SignatureState {
  return {
    ...signature,
    strokes: [],
  };
}

export function resizeSignatureCanvas(signature: SignatureState, width: number, height: number): SignatureState {
  return {
    ...signature,
    canvas: { width, height },
  };
}

import {
  appendPointToSignatureStroke,
  addStroke,
  canSubmitSignature,
  clearSignature,
  createEmptySignature,
  createSignatureStroke,
  sampleStroke,
  undoStroke,
} from '../platform/signature/signatureModel';

describe('signature model', () => {
  it('does not allow upload before at least one stroke exists', () => {
    expect(canSubmitSignature(createEmptySignature())).toBe(false);
  });

  it('supports add, undo, and clear operations', () => {
    const signed = addStroke(createEmptySignature(), sampleStroke);

    expect(canSubmitSignature(signed)).toBe(true);
    expect(canSubmitSignature(undoStroke(signed))).toBe(false);
    expect(canSubmitSignature(clearSignature(signed))).toBe(false);
  });

  it('supports continuous handwritten strokes from move events', () => {
    const started = createSignatureStroke('stroke-1', { x: 10, y: 20, timestamp: 1 });
    const moved = appendPointToSignatureStroke(started, { x: 14, y: 24, timestamp: 2 });
    const duplicate = appendPointToSignatureStroke(moved, { x: 14.5, y: 24.25, timestamp: 3 });

    expect(started.points).toHaveLength(1);
    expect(moved.points).toHaveLength(2);
    expect(duplicate.points).toHaveLength(2);
  });
});

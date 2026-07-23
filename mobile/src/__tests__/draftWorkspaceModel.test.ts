import {
  addDraftItem,
  applyDraftConflict,
  closeDraftTab,
  createDraftWorkspace,
  markDraftSaved,
  markDraftSubmitted,
  openDraftTab,
  removeDraftItem,
  selectDraftTab,
  updateDraftItemQuantity,
} from '../features/orders/draftWorkspaceModel';

const tab = {
  draftId: 'draft-1',
  customerId: 'customer-1',
  customerName: '海淀批发部',
  version: 1,
  status: 'editing' as const,
  items: [],
  dirty: false,
};

describe('draft workspace model', () => {
  it('opens, selects and closes customer draft tabs', () => {
    let state = createDraftWorkspace();
    state = openDraftTab(state, tab);
    state = openDraftTab(state, { ...tab, draftId: 'draft-2', customerId: 'customer-2' });
    state = selectDraftTab(state, 'draft-1');

    expect(state.activeDraftId).toBe('draft-1');
    expect(state.tabs).toHaveLength(2);

    state = closeDraftTab(state, 'draft-1');
    expect(state.activeDraftId).toBe('draft-2');
  });

  it('merges duplicate product scans and tracks dirty state', () => {
    let state = openDraftTab(createDraftWorkspace(), tab);
    state = addDraftItem(state, 'draft-1', { productId: 'product-1', quantity: 2 });
    state = addDraftItem(state, 'draft-1', { productId: 'product-1', quantity: 3, remark: '加急' });

    expect(state.tabs[0].items).toEqual([{ productId: 'product-1', quantity: 5, remark: '加急' }]);
    expect(state.tabs[0].dirty).toBe(true);
  });

  it('updates and removes draft items', () => {
    let state = openDraftTab(createDraftWorkspace(), {
      ...tab,
      items: [{ productId: 'product-1', quantity: 2 }],
    });
    state = updateDraftItemQuantity(state, 'draft-1', 'product-1', 6);
    state = removeDraftItem(state, 'draft-1', 'product-1');

    expect(state.tabs[0].items).toEqual([]);
    expect(state.tabs[0].dirty).toBe(true);
  });

  it('records save, conflict and submit outcomes', () => {
    let state = openDraftTab(createDraftWorkspace(), { ...tab, dirty: true });
    state = markDraftSaved(state, 'draft-1', 2);
    expect(state.tabs[0]).toMatchObject({ dirty: false, version: 2, conflict: null });

    state = applyDraftConflict(state, 'draft-1', 2, 3);
    expect(state.tabs[0].conflict).toEqual({ expectedVersion: 2, actualVersion: 3 });

    state = markDraftSubmitted(state, 'draft-1', 4);
    expect(state.tabs[0]).toMatchObject({ status: 'submitted', version: 4, dirty: false, conflict: null });
  });
});

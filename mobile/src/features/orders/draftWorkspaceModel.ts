export type DraftWorkspaceItem = {
  productId: string;
  quantity: number;
  remark?: string | null;
};

export type DraftWorkspaceTab = {
  draftId: string;
  customerId: string;
  customerName: string;
  version: number;
  status: 'editing' | 'submitted' | 'abandoned';
  items: DraftWorkspaceItem[];
  dirty: boolean;
  conflict?: {
    expectedVersion: number;
    actualVersion: number;
  } | null;
};

export type DraftWorkspaceState = {
  activeDraftId: string | null;
  tabs: DraftWorkspaceTab[];
};

export function createDraftWorkspace(): DraftWorkspaceState {
  return { activeDraftId: null, tabs: [] };
}

function updateTab(
  state: DraftWorkspaceState,
  draftId: string,
  updater: (tab: DraftWorkspaceTab) => DraftWorkspaceTab,
): DraftWorkspaceState {
  return {
    ...state,
    tabs: state.tabs.map(tab => (tab.draftId === draftId ? updater(tab) : tab)),
  };
}

export function openDraftTab(state: DraftWorkspaceState, tab: DraftWorkspaceTab): DraftWorkspaceState {
  const existing = state.tabs.find(item => item.draftId === tab.draftId);
  if (existing) {
    return { ...state, activeDraftId: tab.draftId };
  }
  return {
    activeDraftId: tab.draftId,
    tabs: [...state.tabs, { ...tab, dirty: tab.dirty ?? false, conflict: tab.conflict ?? null }],
  };
}

export function selectDraftTab(state: DraftWorkspaceState, draftId: string): DraftWorkspaceState {
  if (!state.tabs.some(tab => tab.draftId === draftId)) {
    return state;
  }
  return { ...state, activeDraftId: draftId };
}

export function closeDraftTab(state: DraftWorkspaceState, draftId: string): DraftWorkspaceState {
  const tabs = state.tabs.filter(tab => tab.draftId !== draftId);
  return {
    activeDraftId: state.activeDraftId === draftId ? (tabs.at(-1)?.draftId ?? null) : state.activeDraftId,
    tabs,
  };
}

export function addDraftItem(
  state: DraftWorkspaceState,
  draftId: string,
  item: DraftWorkspaceItem,
): DraftWorkspaceState {
  return updateTab(state, draftId, tab => {
    const existing = tab.items.find(entry => entry.productId === item.productId);
    return {
      ...tab,
      dirty: true,
      items: existing
        ? tab.items.map(entry =>
            entry.productId === item.productId
              ? { ...entry, quantity: entry.quantity + item.quantity, remark: item.remark ?? entry.remark }
              : entry,
          )
        : [...tab.items, item],
    };
  });
}

export function updateDraftItemQuantity(
  state: DraftWorkspaceState,
  draftId: string,
  productId: string,
  quantity: number,
): DraftWorkspaceState {
  return updateTab(state, draftId, tab => ({
    ...tab,
    dirty: true,
    items: tab.items.map(item => (item.productId === productId ? { ...item, quantity } : item)),
  }));
}

export function removeDraftItem(state: DraftWorkspaceState, draftId: string, productId: string): DraftWorkspaceState {
  return updateTab(state, draftId, tab => ({
    ...tab,
    dirty: true,
    items: tab.items.filter(item => item.productId !== productId),
  }));
}

export function markDraftSaved(state: DraftWorkspaceState, draftId: string, version: number): DraftWorkspaceState {
  return updateTab(state, draftId, tab => ({ ...tab, version, dirty: false, conflict: null }));
}

export function applyDraftConflict(
  state: DraftWorkspaceState,
  draftId: string,
  expectedVersion: number,
  actualVersion: number,
): DraftWorkspaceState {
  return updateTab(state, draftId, tab => ({
    ...tab,
    conflict: { expectedVersion, actualVersion },
  }));
}

export function markDraftSubmitted(state: DraftWorkspaceState, draftId: string, version: number): DraftWorkspaceState {
  return updateTab(state, draftId, tab => ({
    ...tab,
    version,
    status: 'submitted',
    dirty: false,
    conflict: null,
  }));
}

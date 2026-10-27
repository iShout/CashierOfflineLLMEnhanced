const initialPermissionState = {
  authList: [],
};

const normalizeAuthList = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return [];
};

export const createPermissionSlice = (set) => ({
  ...initialPermissionState,
  setAuthList: (authList) => {
    set({ authList: normalizeAuthList(authList) });
  },
  setPermission: (key, value) =>
    set((state) => ({
      authList: value
        ? Array.from(new Set([...(state.authList ?? []), key]))
        : (state.authList ?? []).filter((code) => code !== key),
    })),
  clearPermissions: () => set(initialPermissionState),
});

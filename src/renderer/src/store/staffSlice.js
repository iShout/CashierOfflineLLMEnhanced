const initialStaffState = {
  staffList: [],
  selectedStaffId: null,
};

export const createStaffSlice = (set) => ({
  ...initialStaffState,
  setStaffList: (staffList) => set({ staffList }),
  selectStaff: (selectedStaffId) => set({ selectedStaffId }),
  resetStaff: () => set(initialStaffState),
});

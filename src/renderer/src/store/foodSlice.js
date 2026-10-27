const initialFoodState = {
  categories: [],
  foods: [],
};

export const createFoodSlice = (set) => ({
  ...initialFoodState,
  setCategories: (categories) => set({ categories }),
  setFoods: (foods) => set({ foods }),
  resetFoods: () => set(initialFoodState),
});

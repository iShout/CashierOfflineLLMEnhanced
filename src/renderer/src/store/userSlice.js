const initialUserState = {
  user: null,
  restaurantSetting: null,
  token: "",
  bir_info: null,
  eodAutoGenerateKey: "",
  isLoginFlowPending: false,
  loginAccount: "",
};

export const createUserSlice = (set) => ({
  ...initialUserState,
  setUser: (user) => set({ user }),
  setRestaurantSetting: (restaurantSetting) => set({ restaurantSetting }),
  setToken: (token) => set({ token }),
  setBirInfo: (bir_info) => set({ bir_info: bir_info || null }),
  // 同一次登录会话只静默补齐一次历史日报，避免切换页面时重复生成。
  setEodAutoGenerateKey: (eodAutoGenerateKey) => set({ eodAutoGenerateKey }),
  setLoginFlowPending: (isLoginFlowPending) => set({ isLoginFlowPending }),
  setLoginAccount: (loginAccount) => set({ loginAccount }),
  applyLoginSession: ({ token, account, user, restaurantSetting }) =>
    set({
      token,
      isLoginFlowPending: false,
      loginAccount: account || user?.account || "",
      ...(user ? { user } : {}),
      ...(restaurantSetting ? { restaurantSetting } : {}),
    }),
  loginSuccess: ({ user, token }) =>
    set({
      user,
      token,
      loginAccount: user?.account || "",
      restaurantSetting: null,
    }),
  logout: () => set(initialUserState),
});

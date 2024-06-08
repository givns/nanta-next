import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UserState {
  id: string;
  lineUserId: string;
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string;
  role: string;
}

const initialState: UserState = {
  id: '',
  lineUserId: '',
  name: '',
  nickname: '',
  department: '',
  employeeNumber: '',
  role: '',
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<UserState>) => {
      return { ...state, ...action.payload };
    },
    clearUser: () => initialState,
  },
});

export const { setUser, clearUser } = userSlice.actions;
export default userSlice.reducer;
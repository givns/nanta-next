import { configureStore } from '@reduxjs/toolkit';
import userReducer from './slices/userSlice';
import leaveReducer from './slices/leaveSlices';
import overtimeReducer from './slices/overtimeSlice';

const store = configureStore({
  reducer: {
    user: userReducer,
    leave: leaveReducer,
    overtime: overtimeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export default store;
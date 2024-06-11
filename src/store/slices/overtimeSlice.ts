import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface OvertimeState {
  overtimeRequests: Array<{
    id: string;
    userId: string;
    date: string;
    hours: number;
    reason: string;
    status: string;
  }>;
}

const initialState: OvertimeState = {
  overtimeRequests: [],
};

const overtimeSlice = createSlice({
  name: 'overtime',
  initialState,
  reducers: {
    setOvertimeRequests: (
      state,
      action: PayloadAction<OvertimeState['overtimeRequests']>,
    ) => {
      state.overtimeRequests = action.payload;
    },
    addOvertimeRequest: (
      state,
      action: PayloadAction<OvertimeState['overtimeRequests'][0]>,
    ) => {
      state.overtimeRequests.push(action.payload);
    },
    updateOvertimeRequest: (
      state,
      action: PayloadAction<OvertimeState['overtimeRequests'][0]>,
    ) => {
      const index = state.overtimeRequests.findIndex(
        (request) => request.id === action.payload.id,
      );
      if (index !== -1) {
        state.overtimeRequests[index] = action.payload;
      }
    },
  },
});

export const {
  setOvertimeRequests,
  addOvertimeRequest,
  updateOvertimeRequest,
} = overtimeSlice.actions;
export default overtimeSlice.reducer;

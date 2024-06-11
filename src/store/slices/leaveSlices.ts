import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface LeaveState {
  leaveRequests: Array<{
    id: string;
    userId: string;
    leaveType: string;
    reason: string;
    startDate: string;
    endDate: string;
    status: string;
  }>;
}

const initialState: LeaveState = {
  leaveRequests: [],
};

const leaveSlice = createSlice({
  name: 'leave',
  initialState,
  reducers: {
    setLeaveRequests: (
      state,
      action: PayloadAction<LeaveState['leaveRequests']>,
    ) => {
      state.leaveRequests = action.payload;
    },
    addLeaveRequest: (
      state,
      action: PayloadAction<LeaveState['leaveRequests'][0]>,
    ) => {
      state.leaveRequests.push(action.payload);
    },
    updateLeaveRequest: (
      state,
      action: PayloadAction<LeaveState['leaveRequests'][0]>,
    ) => {
      const index = state.leaveRequests.findIndex(
        (request) => request.id === action.payload.id,
      );
      if (index !== -1) {
        state.leaveRequests[index] = action.payload;
      }
    },
  },
});

export const { setLeaveRequests, addLeaveRequest, updateLeaveRequest } =
  leaveSlice.actions;
export default leaveSlice.reducer;

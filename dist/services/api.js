import axios from 'axios';
export const getLeaveRequests = async () => {
    try {
        const response = await axios.get('/api/getLeaveRequests');
        return response.data;
    }
    catch (error) {
        console.error('Error fetching leave requests:', error);
        throw error;
    }
};
export const approveLeaveRequest = async (requestId) => {
    try {
        await axios.post('/api/approveLeaveRequest', { requestId });
    }
    catch (error) {
        console.error('Error approving leave request:', error);
        throw error;
    }
};

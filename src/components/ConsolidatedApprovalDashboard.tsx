import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ApprovalDashboard from './ApprovalDashboard';
import AdminShiftAdjustmentForm from './AdminShiftAdjustmentForm';
import NoWorkDayManagement from './NoWorkDayManagement';

interface ConsolidatedApprovalDashboardProps {
  userData: {
    employeeId: string;
    role: string;
    departmentId: string;
    lineUserId: string;
  };
}

const ConsolidatedApprovalDashboard: React.FC<
  ConsolidatedApprovalDashboardProps
> = ({ userData }) => {
  const [activeTab, setActiveTab] = useState('approvals');
  const [approvalData, setApprovalData] = useState({
    leaveRequests: [],
    overtimeRequests: [],
    potentialOvertimes: [],
  });
  const [shiftData, setShiftData] = useState({ shifts: [], departments: [] });
  const [noWorkDayData, setNoWorkDayData] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [approvalResponse, shiftResponse, noWorkDayResponse] =
          await Promise.all([
            axios.get('/api/approvals'),
            axios.get('/api/shifts'),
            axios.get('/api/noWorkDays'),
          ]);
        setApprovalData(approvalResponse.data);
        setShiftData(shiftResponse.data);
        setNoWorkDayData(noWorkDayResponse.data);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  const handleAddNoWorkDay = async (date: Date, reason: string) => {
    try {
      await axios.post('/api/noWorkDays', { date, reason });
      const response = await axios.get('/api/noWorkDays');
      setNoWorkDayData(response.data);
    } catch (error) {
      console.error('Error adding no work day:', error);
    }
  };

  const handleDeleteNoWorkDay = async (id: string) => {
    try {
      await axios.delete(`/api/noWorkDays/${id}`);
      const response = await axios.get('/api/noWorkDays');
      setNoWorkDayData(response.data);
    } catch (error) {
      console.error('Error deleting no work day:', error);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Administrative Dashboard</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="approvals">Approvals</TabsTrigger>
          <TabsTrigger value="shiftAdjustment">Shift Adjustment</TabsTrigger>
          <TabsTrigger value="noWorkDay">No Work Day Management</TabsTrigger>
        </TabsList>
        <TabsContent value="approvals">
          <ApprovalDashboard
            leaveRequests={approvalData.leaveRequests}
            overtimeRequests={approvalData.overtimeRequests}
            potentialOvertimes={approvalData.potentialOvertimes}
          />
        </TabsContent>
        <TabsContent value="shiftAdjustment">
          <AdminShiftAdjustmentForm
            lineUserId={userData.lineUserId}
            shifts={shiftData.shifts}
            departments={shiftData.departments}
          />
        </TabsContent>
        <TabsContent value="noWorkDay">
          <NoWorkDayManagement
            noWorkDays={noWorkDayData}
            onAddNoWorkDay={handleAddNoWorkDay}
            onDeleteNoWorkDay={handleDeleteNoWorkDay}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsolidatedApprovalDashboard;

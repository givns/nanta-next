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
    departmentName: string;
    lineUserId: string;
  };
}

const ConsolidatedApprovalDashboard: React.FC<
  ConsolidatedApprovalDashboardProps
> = ({ userData }) => {
  const [activeTab, setActiveTab] = useState('approvals');
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [overtimeRequests, setOvertimeRequests] = useState([]);
  const [potentialOvertimes, setPotentialOvertimes] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [noWorkDays, setNoWorkDays] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          leaveResponse,
          overtimeResponse,
          potentialOvertimeResponse,
          shiftsResponse,
          departmentsResponse,
          noWorkDaysResponse,
        ] = await Promise.all([
          axios.get('/api/getLeaveRequests'),
          axios.get('/api/getOvertimeRequests'),
          axios.get('/api/getPotentialOvertimes'),
          axios.get('/api/shifts/shifts'),
          axios.get('/api/departments'),
          axios.get('/api/noWorkDays'),
        ]);

        setLeaveRequests(leaveResponse.data);
        setOvertimeRequests(overtimeResponse.data);
        setPotentialOvertimes(potentialOvertimeResponse.data);
        setShifts(shiftsResponse.data);
        setDepartments(departmentsResponse.data);
        setNoWorkDays(noWorkDaysResponse.data);
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
      setNoWorkDays(response.data);
    } catch (error) {
      console.error('Error adding no work day:', error);
    }
  };

  const handleDeleteNoWorkDay = async (id: string) => {
    try {
      await axios.delete(`/api/noWorkDays/${id}`);
      const response = await axios.get('/api/noWorkDays');
      setNoWorkDays(response.data);
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
            leaveRequests={leaveRequests}
            overtimeRequests={overtimeRequests}
            potentialOvertimes={potentialOvertimes}
          />
        </TabsContent>
        <TabsContent value="shiftAdjustment">
          <AdminShiftAdjustmentForm
            lineUserId={userData.lineUserId}
            shifts={shifts}
            departments={departments}
          />
        </TabsContent>
        <TabsContent value="noWorkDay">
          <NoWorkDayManagement
            noWorkDays={noWorkDays}
            onAddNoWorkDay={handleAddNoWorkDay}
            onDeleteNoWorkDay={handleDeleteNoWorkDay}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsolidatedApprovalDashboard;

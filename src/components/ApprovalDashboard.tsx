import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, Calendar, Clock, User } from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { UserRole } from '@/types/enum';

interface UserDataProps {
  employeeId: string;
  role: UserRole;
  departmentName: string;
  lineUserId: string;
}

interface ApprovalRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  departmentName: string;
  type: 'LEAVE' | 'OVERTIME' | 'LATE_CHECK_IN' | 'EARLY_CHECK_OUT';
  date: string;
  startTime?: string;
  endTime?: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

const ConsolidatedApprovalDashboard: React.FC<{ userData: UserDataProps }> = ({
  userData,
}) => {
  const [selectedTab, setSelectedTab] = useState('pending');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApprovals();
  }, [selectedTab, userData]);

  const fetchApprovals = async () => {
    try {
      setIsLoading(true);
      const [leaveResponse, overtimeResponse] = await Promise.all([
        axios.get('/api/leave-requests', {
          params: {
            status: selectedTab,
            departmentName: userData.departmentName,
          },
        }),
        axios.get('/api/overtime-requests', {
          params: {
            status: selectedTab,
            departmentName: userData.departmentName,
          },
        }),
      ]);

      const combinedRequests = [
        ...leaveResponse.data.map((req: any) => ({ ...req, type: 'LEAVE' })),
        ...overtimeResponse.data.map((req: any) => ({
          ...req,
          type: 'OVERTIME',
        })),
      ];

      setRequests(combinedRequests);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch approvals',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproval = async (
    id: string,
    type: string,
    action: 'approve' | 'reject',
  ) => {
    try {
      const endpoint =
        type === 'LEAVE' ? '/api/leave-requests' : '/api/overtime-requests';
      await axios.post(`${endpoint}/${id}/action`, {
        action,
        approverId: userData.employeeId,
      });

      await fetchApprovals();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to process approval',
      );
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        className: 'bg-yellow-100 text-yellow-800',
        text: 'รออนุมัติ',
      },
      approved: {
        className: 'bg-green-100 text-green-800',
        text: 'อนุมัติแล้ว',
      },
      rejected: { className: 'bg-red-100 text-red-800', text: 'ไม่อนุมัติ' },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    return <Badge className={config.className}>{config.text}</Badge>;
  };

  const getRequestTypeText = (type: string) => {
    const typeMap = {
      LEAVE: 'คำขอลา',
      OVERTIME: 'คำขอทำงานล่วงเวลา',
      LATE_CHECK_IN: 'คำขอลงเวลาย้อนหลัง',
      EARLY_CHECK_OUT: 'คำขอออกก่อนเวลา',
    };
    return typeMap[type as keyof typeof typeMap];
  };

  const renderRequestCard = (request: ApprovalRequest) => (
    <Card key={request.id} className="mb-4">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <User className="w-5 h-5 text-gray-500" />
            <CardTitle className="text-lg">
              {request.employeeName} ({request.employeeId})
            </CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusBadge(request.status)}
            <Badge className="bg-blue-100 text-blue-800">
              {getRequestTypeText(request.type)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span>
                {format(new Date(request.date), 'dd MMMM yyyy', { locale: th })}
              </span>
            </div>
            {(request.startTime || request.endTime) && (
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>
                  {request.startTime} - {request.endTime}
                </span>
              </div>
            )}
          </div>

          <div>
            <p className="text-sm text-gray-600 font-medium">แผนก</p>
            <p className="text-sm">{request.departmentName}</p>
          </div>

          <div>
            <p className="text-sm text-gray-600 font-medium">เหตุผล</p>
            <p className="text-sm">{request.reason}</p>
          </div>

          {request.status === 'pending' && (
            <div className="flex space-x-2 mt-4">
              <Button
                onClick={() =>
                  handleApproval(request.id, request.type, 'approve')
                }
                className="bg-green-500 hover:bg-green-600 text-white"
              >
                อนุมัติ
              </Button>
              <Button
                onClick={() =>
                  handleApproval(request.id, request.type, 'reject')
                }
                variant="destructive"
              >
                ไม่อนุมัติ
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>เกิดข้อผิดพลาด</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">ระบบอนุมัติคำขอ</h1>
        <div className="text-sm text-gray-500">
          {userData.departmentName} - {userData.role}
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending">
            รออนุมัติ
            {requests.filter((r) => r.status === 'pending').length > 0 && (
              <Badge className="ml-2 bg-red-500">
                {requests.filter((r) => r.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">อนุมัติแล้ว</TabsTrigger>
          <TabsTrigger value="rejected">ไม่อนุมัติ</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          {isLoading ? (
            <div className="text-center py-8">กำลังโหลด...</div>
          ) : requests.filter((r) => r.status === 'pending').length > 0 ? (
            requests
              .filter((r) => r.status === 'pending')
              .map(renderRequestCard)
          ) : (
            <div className="text-center py-8 text-gray-500">
              ไม่มีคำขอที่รออนุมัติ
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>พนักงาน</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>เวลา</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests
                .filter((r) => r.status === 'approved')
                .map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.employeeName}</TableCell>
                    <TableCell>{getRequestTypeText(request.type)}</TableCell>
                    <TableCell>
                      {format(new Date(request.date), 'dd/MM/yyyy', {
                        locale: th,
                      })}
                    </TableCell>
                    <TableCell>
                      {request.startTime && request.endTime
                        ? `${request.startTime} - ${request.endTime}`
                        : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="rejected">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>พนักงาน</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>เวลา</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests
                .filter((r) => r.status === 'rejected')
                .map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>{request.employeeName}</TableCell>
                    <TableCell>{getRequestTypeText(request.type)}</TableCell>
                    <TableCell>
                      {format(new Date(request.date), 'dd/MM/yyyy', {
                        locale: th,
                      })}
                    </TableCell>
                    <TableCell>
                      {request.startTime && request.endTime
                        ? `${request.startTime} - ${request.endTime}`
                        : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(request.status)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsolidatedApprovalDashboard;

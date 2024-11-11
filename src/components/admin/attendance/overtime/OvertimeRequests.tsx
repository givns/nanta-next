import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Clock, Search, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';

interface OvertimeRequest {
  id: string;
  employeeId: string;
  name: string;
  department: string;
  date: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  reason: string;
  status: 'pending_response' | 'approved' | 'rejected';
  isDayOffOvertime: boolean;
  employeeResponse?: 'approve' | 'deny' | null;
}

export default function OvertimeRequests() {
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  const { lineUserId } = useLiff();
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('pending_response');
  const [searchTerm, setSearchTerm] = useState('');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<OvertimeRequest | null>(null);

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  // Handle unauthorized access
  if (!isAuthorized || !user) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access the payroll system.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Mobile card component
  const RequestCard = ({ request }: { request: OvertimeRequest }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{request.name}</div>
            <div className="text-sm text-gray-500">{request.department}</div>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={request.status} />
            {request.isDayOffOvertime && (
              <Badge variant="destructive">Day-off OT</Badge>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              {format(new Date(request.date), 'dd MMM yyyy', { locale: th })} |{' '}
              {request.startTime} - {request.endTime} ({request.durationMinutes}
              h)
            </span>
          </div>

          <div className="text-sm text-gray-600 mt-2">
            <p className="font-medium">Reason:</p>
            <p>{request.reason}</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRequest(request);
              setShowDetailsDialog(true);
            }}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Filter section
  const FilterSection = () => (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending_response">Pending Response</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search employee or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Desktop table view
  const DesktopTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests
            .filter((request) =>
              searchTerm
                ? request.name
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase()) ||
                  request.department
                    .toLowerCase()
                    .includes(searchTerm.toLowerCase())
                : true,
            )
            .map((request) => (
              <TableRow key={request.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{request.name}</div>
                    <div className="text-sm text-gray-500">
                      {request.department}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {format(new Date(request.date), 'dd MMM yyyy', {
                    locale: th,
                  })}
                </TableCell>
                <TableCell>
                  {request.startTime} - {request.endTime}
                  <div className="text-sm text-gray-500">
                    {request.durationMinutes}h
                  </div>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      request.isDayOffOvertime ? 'destructive' : 'default'
                    }
                  >
                    {request.isDayOffOvertime ? 'Day-off OT' : 'Regular OT'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {request.reason}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedRequest(request);
                      setShowDetailsDialog(true);
                    }}
                  >
                    Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </div>
  );

  useEffect(() => {
    if (user?.lineUserId) {
      fetchRequests();
    }
  }, [user, statusFilter]);

  const fetchRequests = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/admin/attendance/overtime-requests${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      if (!response.ok) {
        throw new Error('Failed to fetch overtime requests');
      }

      const data = await response.json();
      setRequests(data);
    } catch (error) {
      setError('Failed to load overtime requests');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Overtime Requests</CardTitle>
          {requests.length > 0 && (
            <div className="text-sm text-gray-500">
              Showing {requests.length} requests
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FilterSection />

        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <Clock className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            {/* Mobile View */}
            <div className="md:hidden">
              {requests
                .filter((request) =>
                  searchTerm
                    ? request.name
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      request.department
                        .toLowerCase()
                        .includes(searchTerm.toLowerCase())
                    : true,
                )
                .map((request) => (
                  <RequestCard key={request.id} request={request} />
                ))}
            </div>

            {/* Desktop View */}
            <DesktopTable />

            {/* Empty State */}
            {!isLoading && requests.length === 0 && (
              <div className="text-center py-12">
                <Clock className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No overtime requests
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  No requests found for the selected status
                </p>
              </div>
            )}
          </>
        )}

        {/* Request Details Dialog */}
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Overtime Request Details</DialogTitle>
              <DialogDescription>
                Detailed information about the overtime request
              </DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Employee
                    </label>
                    <p className="mt-1">{selectedRequest.name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Department
                    </label>
                    <p className="mt-1">{selectedRequest.department}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Date
                    </label>
                    <p className="mt-1">
                      {format(new Date(selectedRequest.date), 'dd MMMM yyyy', {
                        locale: th,
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Time
                    </label>
                    <p className="mt-1">
                      {selectedRequest.startTime} - {selectedRequest.endTime}
                      <span className="text-sm text-gray-500 ml-2">
                        ({selectedRequest.durationMinutes}h)
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Overtime Type
                    </label>
                    <p className="mt-1">
                      <Badge
                        variant={
                          selectedRequest.isDayOffOvertime
                            ? 'destructive'
                            : 'default'
                        }
                      >
                        {selectedRequest.isDayOffOvertime
                          ? 'Day-off Overtime'
                          : 'Regular Overtime'}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Status
                    </label>
                    <p className="mt-1">
                      <StatusBadge status={selectedRequest.status} />
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-500">
                    Reason for Overtime
                  </label>
                  <p className="mt-1 text-sm text-gray-700">
                    {selectedRequest.reason}
                  </p>
                </div>

                {selectedRequest.employeeResponse && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">
                      Employee Response
                    </label>
                    <p className="mt-1">
                      <Badge
                        variant={
                          selectedRequest.employeeResponse === 'approve'
                            ? 'success'
                            : 'destructive'
                        }
                      >
                        {selectedRequest.employeeResponse === 'approve'
                          ? 'Approved'
                          : 'Denied'}
                      </Badge>
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles = {
    pending_response: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  const labels = {
    pending_response: 'Pending Employee Response',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  return (
    <Badge className={styles[status as keyof typeof styles]}>
      {labels[status as keyof typeof labels]}
    </Badge>
  );
};

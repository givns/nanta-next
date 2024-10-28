// components/admin/approvals/ApprovalDashboard.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Search,
  ClipboardList,
} from 'lucide-react';

interface ApprovalRequest {
  id: string;
  type: 'leave' | 'overtime';
  employeeId: string;
  employeeName: string;
  department: string;
  requestDate: Date;
  details: {
    startDate?: Date;
    endDate?: Date;
    startTime?: string;
    endTime?: string;
    reason: string;
    leaveType?: string;
    duration?: number;
  };
  status: 'pending' | 'approved' | 'rejected';
  isUrgent: boolean;
}

export default function ApprovalDashboard() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('pending');
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<ApprovalRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Mobile card component
  const RequestCard = ({ request }: { request: ApprovalRequest }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{request.employeeName}</div>
            <div className="text-sm text-gray-500">{request.department}</div>
          </div>
          <Badge
            variant={request.type === 'leave' ? 'default' : 'secondary'}
            className="ml-2"
          >
            {request.type === 'leave' ? 'Leave' : 'Overtime'}
          </Badge>
          {request.isUrgent && (
            <Badge variant="destructive" className="ml-2">
              Urgent
            </Badge>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {request.type === 'leave' ? (
            <div className="flex items-center text-sm">
              <Calendar className="h-4 w-4 mr-2" />
              <span>
                {format(request.details.startDate!, 'dd MMM')} -{' '}
                {format(request.details.endDate!, 'dd MMM')}
              </span>
            </div>
          ) : (
            <div className="flex items-center text-sm">
              <Clock className="h-4 w-4 mr-2" />
              <span>
                {request.details.startTime} - {request.details.endTime}
                {request.details.duration && ` (${request.details.duration}h)`}
              </span>
            </div>
          )}

          <div className="text-sm text-gray-600">{request.details.reason}</div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => handleApprove(request.id)}
          >
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => handleReject(request.id)}
          >
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Desktop table view
  const RequestsTable = () => (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Date/Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{request.employeeName}</div>
                  <div className="text-sm text-gray-500">
                    {request.department}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={request.type === 'leave' ? 'default' : 'secondary'}
                  >
                    {request.type === 'leave' ? 'Leave' : 'Overtime'}
                  </Badge>
                  {request.isUrgent && (
                    <Badge variant="destructive">Urgent</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                {request.type === 'leave' ? (
                  <div>
                    <span className="font-medium">
                      {request.details.leaveType}
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      {request.details.reason}
                    </p>
                  </div>
                ) : (
                  <div>
                    <span className="font-medium">
                      {request.details.duration}h Overtime
                    </span>
                    <p className="text-sm text-gray-500 mt-1">
                      {request.details.reason}
                    </p>
                  </div>
                )}
              </TableCell>
              <TableCell>
                {request.type === 'leave' ? (
                  <span>
                    {format(request.details.startDate!, 'dd MMM')} -{' '}
                    {format(request.details.endDate!, 'dd MMM')}
                  </span>
                ) : (
                  <span>
                    {request.details.startTime} - {request.details.endTime}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => handleApprove(request.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(request.id)}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Reject
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // Filter section
  const FilterSection = () => (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Request Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="leave">Leave Requests</SelectItem>
            <SelectItem value="overtime">Overtime Requests</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedStatus} onValueChange={setSelectedStatus}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const variants: {
      [key: string]:
        | 'default'
        | 'success'
        | 'destructive'
        | 'secondary'
        | 'outline'
        | 'warning'
        | 'error'
        | 'attendance'
        | null
        | undefined;
    } = {
      pending: 'default',
      approved: 'success',
      rejected: 'destructive',
      // Add the fallback option for other status values
      // For example, if the status is not 'pending', 'approved', or 'rejected', it will default to 'default'
      // You can update the fallback option based on your specific requirements
      default: 'default',
    };

    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Event handlers
  const handleApprove = async (id: string) => {
    // Implement approval logic
  };

  const handleReject = async (id: string) => {
    // Implement rejection logic
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Approvals</CardTitle>
      </CardHeader>
      <CardContent>
        <FilterSection />

        {/* Mobile View */}
        <div className="md:hidden">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>

        {/* Desktop View */}
        <RequestsTable />

        {/* Empty State */}
        {requests.length === 0 && (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No pending requests
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              All requests have been processed
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

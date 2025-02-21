import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Phone, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface LocationRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  requestedAt: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
  address?: string;
  accuracy: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export default function LocationAssistanceAdmin() {
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [selectedRequest, setSelectedRequest] =
    useState<LocationRequest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationNote, setVerificationNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
    // Set up polling
    const interval = setInterval(fetchRequests, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, []);

  async function fetchRequests() {
    try {
      const response = await fetch('/api/admin/location-assistance');
      if (!response.ok) throw new Error('Failed to fetch requests');
      const data = await response.json();
      setRequests(data.requests);
    } catch (error) {
      console.error('Error fetching requests:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch requests',
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    try {
      setIsProcessing(true);
      const response = await fetch(
        `/api/admin/location-assistance/${requestId}/approve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            note: verificationNote,
            verifiedAt: new Date().toISOString(),
          }),
        },
      );

      if (!response.ok) throw new Error('Failed to approve request');

      // Update local state
      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, status: 'APPROVED' } : req,
        ),
      );
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error approving request:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to approve request',
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleReject(requestId: string) {
    try {
      setIsProcessing(true);
      const response = await fetch(
        `/api/admin/location-assistance/${requestId}/reject`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: rejectionReason,
            rejectedAt: new Date().toISOString(),
          }),
        },
      );

      if (!response.ok) throw new Error('Failed to reject request');

      // Update local state
      setRequests((prev) =>
        prev.map((req) =>
          req.id === requestId ? { ...req, status: 'REJECTED' } : req,
        ),
      );
      setSelectedRequest(null);
    } catch (error) {
      console.error('Error rejecting request:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to reject request',
      );
    } finally {
      setIsProcessing(false);
    }
  }

  function getStatusBadge(status: LocationRequest['status']) {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary">รอตรวจสอบ</Badge>;
      case 'APPROVED':
        return (
          <Badge variant="success" className="bg-green-100 text-green-800">
            อนุมัติแล้ว
          </Badge>
        );
      case 'REJECTED':
        return <Badge variant="destructive">ไม่อนุมัติ</Badge>;
      default:
        return null;
    }
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">คำขอตรวจสอบตำแหน่ง</h1>
        <p className="text-gray-600">จัดการคำขอตรวจสอบตำแหน่งของพนักงาน</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>คำขอที่รอดำเนินการ</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>พนักงาน</TableHead>
                <TableHead>แผนก</TableHead>
                <TableHead>เหตุผล</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>การดำเนินการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    {format(new Date(request.requestedAt), 'HH:mm', {
                      locale: th,
                    })}
                  </TableCell>
                  <TableCell>
                    <div>{request.employeeName}</div>
                    <div className="text-sm text-gray-500">
                      {request.employeeId}
                    </div>
                  </TableCell>
                  <TableCell>{request.department}</TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate">{request.reason}</div>
                  </TableCell>
                  <TableCell>{getStatusBadge(request.status)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRequest(request)}
                      disabled={request.status !== 'PENDING'}
                    >
                      ตรวจสอบ
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500">
                    ไม่มีคำขอที่รอดำเนินการ
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Verification Dialog */}
      <Dialog
        open={!!selectedRequest}
        onOpenChange={() => setSelectedRequest(null)}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>ตรวจสอบตำแหน่ง</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-6">
              {/* Employee Info */}
              <div>
                <h4 className="font-medium mb-2">ข้อมูลพนักงาน</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">ชื่อ-นามสกุล</div>
                    <div>{selectedRequest.employeeName}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">รหัสพนักงาน</div>
                    <div>{selectedRequest.employeeId}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">แผนก</div>
                    <div>{selectedRequest.department}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">เวลาที่ขอ</div>
                    <div>
                      {format(new Date(selectedRequest.requestedAt), 'HH:mm', {
                        locale: th,
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Info */}
              {selectedRequest.coordinates && (
                <div>
                  <h4 className="font-medium mb-2">ข้อมูลตำแหน่ง</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">พิกัด: </span>
                      {selectedRequest.coordinates.lat},{' '}
                      {selectedRequest.coordinates.lng}
                    </div>
                    {selectedRequest.address && (
                      <div>
                        <span className="text-gray-500">ที่อยู่: </span>
                        {selectedRequest.address}
                      </div>
                    )}
                    <div>
                      <span className="text-gray-500">ความแม่นยำ: </span>±
                      {Math.round(selectedRequest.accuracy)} เมตร
                    </div>
                  </div>
                </div>
              )}

              {/* Verification Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    บันทึกการตรวจสอบ
                  </label>
                  <Textarea
                    value={verificationNote}
                    onChange={(e) => setVerificationNote(e.target.value)}
                    placeholder="บันทึกวิธีการตรวจสอบ เช่น โทรยืนยันกับพนักงาน"
                    rows={3}
                  />
                </div>

                {/* Rejection Reason (shown only when rejecting) */}
                {rejectionReason !== '' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      เหตุผลที่ไม่อนุมัติ
                    </label>
                    <Input
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="ระบุเหตุผล"
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRejectionReason('กรุณาระบุเหตุผล')}
                  disabled={isProcessing}
                >
                  <Phone className="mr-2 h-4 w-4" />
                  โทรหาพนักงาน
                </Button>
                <div className="flex-1" />
                <Button
                  variant="destructive"
                  onClick={() => handleReject(selectedRequest.id)}
                  disabled={isProcessing || !rejectionReason}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  ไม่อนุมัติ
                </Button>
                <Button
                  onClick={() => handleApprove(selectedRequest.id)}
                  disabled={isProcessing || !verificationNote}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  อนุมัติ
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

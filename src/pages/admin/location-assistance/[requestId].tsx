// pages/admin/location-assistance/[requestId].tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import GoogleMap from '@/components/GoogleMap';
import { LocationAssistanceRequest } from '@/types/attendance';
import { Clock, AlertCircle, User, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const LocationAssistanceDetails = () => {
  const router = useRouter();
  const { requestId } = router.query;

  const [request, setRequest] = useState<LocationAssistanceRequest | null>(
    null,
  );
  const [employeeHistory, setEmployeeHistory] = useState<
    LocationAssistanceRequest[]
  >([]);
  const [, setMapLoaded] = useState(false);
  const [verificationNote, setVerificationNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (requestId) {
      fetchRequestDetails();
    }
  }, [requestId]);

  const fetchRequestDetails = async () => {
    try {
      const response = await fetch(
        `/api/admin/location-assistance/${requestId}`,
      );
      if (!response.ok) throw new Error('Failed to fetch request details');
      const data = await response.json();
      setRequest(data);

      if (data.employeeId) {
        fetchEmployeeHistory(data.employeeId);
      }
    } catch (error) {
      setError('Failed to load request details');
      console.error(error);
    }
  };

  const fetchEmployeeHistory = async (employeeId: string) => {
    try {
      const response = await fetch(
        `/api/admin/location-assistance/history/${employeeId}`,
      );
      if (!response.ok) throw new Error('Failed to fetch history');
      const data = await response.json();
      setEmployeeHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleApprove = async () => {
    if (!verificationNote) {
      setError('กรุณาระบุหมายเหตุการอนุมัติ');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/location-assistance/${requestId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verificationNote }),
        },
      );

      if (!response.ok) throw new Error('Failed to approve request');
      router.push('/admin/location-assistance');
    } catch (error) {
      setError('Failed to approve request');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!verificationNote) {
      setError('กรุณาระบุเหตุผลที่ไม่อนุมัติ');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/admin/location-assistance/${requestId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rejectionReason: verificationNote }),
        },
      );

      if (!response.ok) throw new Error('Failed to reject request');
      router.push('/admin/location-assistance');
    } catch (error) {
      setError('Failed to reject request');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!request) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">กำลังโหลด...</h2>
          <p className="text-gray-500">รอสักครู่</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">รายละเอียดคำขอตรวจสอบตำแหน่ง</h1>
        <Badge
          variant={
            request.status === 'APPROVED'
              ? 'success'
              : request.status === 'REJECTED'
                ? 'destructive'
                : 'secondary'
          }
        >
          {request.status === 'APPROVED'
            ? 'อนุมัติแล้ว'
            : request.status === 'REJECTED'
              ? 'ไม่อนุมัติ'
              : 'รอตรวจสอบ'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Request Details */}
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลคำขอ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start space-x-2">
              <User className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <div className="font-medium">
                  {request.employee?.name || request.employeeId}
                </div>
                <div className="text-sm text-gray-500">
                  {request.employeeId}
                </div>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <Clock className="h-5 w-5 text-gray-500 mt-0.5" />
              <div>
                <div className="font-medium">
                  {format(
                    new Date(request.requestedAt),
                    'dd MMMM yyyy HH:mm น.',
                    { locale: th },
                  )}
                </div>
                <div className="text-sm text-gray-500">เวลาที่ขอ</div>
              </div>
            </div>

            {request.reason && (
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-gray-500 mt-0.5" />
                <div>
                  <div className="font-medium">เหตุผล</div>
                  <div className="text-sm">{request.reason}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Location Map */}
        {request.coordinates && (
          <Card>
            <CardHeader>
              <CardTitle>แผนที่</CardTitle>
              <CardDescription>
                {request.address || 'ไม่ระบุที่อยู่'}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[400px] relative">
              <GoogleMap
                lat={request.coordinates.lat}
                lng={request.coordinates.lng}
                accuracy={request.accuracy}
                onLoad={() => setMapLoaded(true)}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* History */}
      {employeeHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ประวัติการขอตรวจสอบ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {employeeHistory.map((historyItem) => (
                <div
                  key={historyItem.id}
                  className="flex items-center justify-between py-2 border-b"
                >
                  <div>
                    <div className="font-medium">
                      {format(
                        new Date(historyItem.requestedAt),
                        'dd MMMM yyyy HH:mm',
                        { locale: th },
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      {historyItem.reason || 'ไม่ระบุเหตุผล'}
                    </div>
                  </div>
                  <Badge
                    variant={
                      historyItem.status === 'APPROVED'
                        ? 'success'
                        : historyItem.status === 'REJECTED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {historyItem.status === 'APPROVED'
                      ? 'อนุมัติ'
                      : historyItem.status === 'REJECTED'
                        ? 'ไม่อนุมัติ'
                        : 'รอตรวจสอบ'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification Actions */}
      {request.status === 'PENDING' && (
        <Card>
          <CardHeader>
            <CardTitle>การตรวจสอบ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="ระบุหมายเหตุหรือเหตุผล"
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
            />
            <div className="flex space-x-4">
              <Button
                onClick={handleApprove}
                disabled={isSubmitting || !verificationNote}
                className="flex-1"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                อนุมัติ
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={isSubmitting || !verificationNote}
                className="flex-1"
              >
                <XCircle className="mr-2 h-4 w-4" />
                ไม่อนุมัติ
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LocationAssistanceDetails;

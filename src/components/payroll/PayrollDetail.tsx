import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  OvertimeHours, 
  OvertimeAmounts, 
  HolidayHours, 
  HolidayAmounts 
} from '@/types/payroll';

interface PayrollBreakdownProps {
  regularHours: number;
  overtimeHours: OvertimeHours;
  holidayHours: HolidayHours;
  basePayAmount: number;
  overtimeAmounts: OvertimeAmounts;
  holidayAmounts: HolidayAmounts;
}

export const PayrollBreakdown: React.FC<PayrollBreakdownProps> = ({
  regularHours,
  overtimeHours,
  holidayHours,
  basePayAmount,
  overtimeAmounts,
  holidayAmounts,
}) => {
  const formatCurrency = (amount: number) => 
    `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
  
  const formatHours = (hours: number) => 
    `${hours.toFixed(2)} hrs`;

  return (
    <div className="space-y-6">
      {/* Regular Hours & Base Pay */}
      <Card>
        <CardHeader>
          <CardTitle>Regular Hours & Base Pay</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Regular Hours</p>
              <p className="text-lg font-semibold">{formatHours(regularHours)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Base Pay</p>
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(basePayAmount)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overtime Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Overtime Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Regular Workday</span>
                    <Badge variant="outline" className="ml-2">1.5x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(overtimeHours.workdayRegular)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(overtimeAmounts.workdayRegular)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Outside Shift</span>
                    <Badge variant="outline" className="ml-2">2.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(overtimeHours.workdayOutside)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(overtimeAmounts.workdayOutside)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Weekend (Regular)</span>
                    <Badge variant="outline" className="ml-2">2.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(overtimeHours.weekendInside)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(overtimeAmounts.weekendInside)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Weekend (Outside)</span>
                    <Badge variant="outline" className="ml-2">3.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(overtimeHours.weekendOutside)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(overtimeAmounts.weekendOutside)}
                </TableCell>
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell>Total Overtime</TableCell>
                <TableCell>{formatHours(overtimeHours.total)}</TableCell>
                <TableCell className="text-right text-green-600">
                  {formatCurrency(overtimeAmounts.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Holiday Pay Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Holiday Pay Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Regular Holiday</span>
                    <Badge variant="outline" className="ml-2">1.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(holidayHours.regularDay)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(holidayAmounts.regularDay)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Weekend Holiday</span>
                    <Badge variant="outline" className="ml-2">2.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(holidayHours.weekend)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(holidayAmounts.weekend)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <div className="space-y-1">
                    <span>Special Holiday</span>
                    <Badge variant="outline" className="ml-2">3.0x</Badge>
                  </div>
                </TableCell>
                <TableCell>{formatHours(holidayHours.specialHoliday)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(holidayAmounts.specialHoliday)}
                </TableCell>
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell>Total Holiday Pay</TableCell>
                <TableCell>{formatHours(holidayHours.total)}</TableCell>
                <TableCell className="text-right text-green-600">
                  {formatCurrency(holidayAmounts.total)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
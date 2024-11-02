import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PayrollCalculationResult } from '@/types/payroll';
import { OverviewCards } from './cards/OverviewCards';
import { AttendanceDetails } from './cards/AttendanceDetails';
import { LeaveDetails } from './cards/LeaveDetails';
import { PayrollCalculation } from './cards/PayrollCalculation';

const tabVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

interface PayrollTabsProps {
  activeTab: string;
  direction: number;
  onTabChange: (value: string) => void;
  payrollData: PayrollCalculationResult;
}

const PayrollTabs: React.FC<PayrollTabsProps> = ({
  activeTab,
  direction,
  onTabChange,
  payrollData,
}) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList className="grid grid-cols-4 w-full">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="leaves">Leaves</TabsTrigger>
        <TabsTrigger value="calculation">Calculation</TabsTrigger>
      </TabsList>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={activeTab}
          custom={direction}
          variants={tabVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3 }}
          className="mt-6"
        >
          {activeTab === 'overview' && (
            <OverviewCards payrollData={payrollData} />
          )}
          {activeTab === 'attendance' && (
            <AttendanceDetails payrollData={payrollData} />
          )}
          {activeTab === 'leaves' && <LeaveDetails payrollData={payrollData} />}
          {activeTab === 'calculation' && (
            <PayrollCalculation payrollData={payrollData} />
          )}
        </motion.div>
      </AnimatePresence>
    </Tabs>
  );
};

export default PayrollTabs;

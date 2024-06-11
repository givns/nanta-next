import React from 'react';
import LeaveBalance from '../components/LeaveBalance';
import OvertimeBalance from '../components/OvertimeBalance';

const UserBalances = ({ userId }: { userId: string }) => {
  return (
    <div>
      <h1>User Balances</h1>
      <LeaveBalance userId={userId} />
      <OvertimeBalance userId={userId} />
    </div>
  );
};

export default UserBalances;

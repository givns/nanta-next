import React from 'react';
import EmployeeManagement from '../components/EmployeeManagement';

const EmployeeManagementPage: React.FC = () => {
  return (
    <div>
      <h1 className="text-3xl font-bold text-center mt-10">
        Employee Management
      </h1>
      <EmployeeManagement />
    </div>
  );
};

export default EmployeeManagementPage;

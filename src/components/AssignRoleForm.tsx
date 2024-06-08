import React, { useState } from 'react';
import axios from 'axios';
import { useDispatch } from 'react-redux';
import { setUser } from '../store/slices/userSlice';

const AssignRoleForm = () => {
  const [userId, setUserId] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const dispatch = useDispatch();

  const handleRoleAssignment = () => {
    if (position.toLowerCase() === 'ceo') {
      setRole('super-admin');
    } else if (department.toLowerCase() === 'ฝ่ายขนส่ง' || department.toLowerCase() === 'transport department' || department.toLowerCase() === 'ฝ่ายปฏิบัติการ' || department.toLowerCase() === 'operation') {
      setRole('special');
    } else {
      setRole('general');
    }
  };

 const handleSubmit = async (event: React.FormEvent) => {
   event.preventDefault();
   handleRoleAssignment();
 
   try {
     const response = await axios.post('/api/assignRole', { userId, role });
     dispatch(setUser(response.data.data));
     setMessage(`Role assigned successfully: ${response.data.data.role}`);
   } catch (error: any) {
     setMessage(`Error: ${error.response?.data?.error || error.message}`);
   }
 };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>User ID</label>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Department</label>
        <input
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          required
        />
      </div>
      <div>
        <label>Position</label>
        <input
          type="text"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          required
        />
      </div>
      <button type="submit">Assign Role</button>
      {message && <p>{message}</p>}
    </form>
  );
};

export default AssignRoleForm;
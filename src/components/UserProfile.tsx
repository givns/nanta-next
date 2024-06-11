import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { setUser, clearUser } from '../store/slices/userSlice';

const UserProfile = () => {
  const user = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch();

  const handleUpdateUser = () => {
    dispatch(
      setUser({
        id: '123',
        lineUserId: 'line-id-123',
        name: 'John Doe',
        nickname: 'Johnny',
        department: 'IT',
        employeeNumber: 'EMP123',
        role: 'admin',
      }),
    );
  };

  const handleClearUser = () => {
    dispatch(clearUser());
  };

  return (
    <div>
      <h1>User Profile</h1>
      <pre>{JSON.stringify(user, null, 2)}</pre>
      <button onClick={handleUpdateUser}>Update User</button>
      <button onClick={handleClearUser}>Clear User</button>
    </div>
  );
};

export default UserProfile;

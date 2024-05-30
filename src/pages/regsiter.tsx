import { useState, ChangeEvent, FormEvent } from 'react';
import axios from 'axios';

interface IForm {
  name: string;
  nickname: string;
  department: string;
  employeeNumber: string;
}

export default function Register() {
  const [form, setForm] = useState<IForm>({ name: '', nickname: '', department: '', employeeNumber: '' });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/register', form);
      alert('User registered successfully');
    } catch (error) {
      alert('Registration failed');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl mb-4">Register</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={handleChange}
          className="border p-2 w-full"
        />
        <input
          type="text"
          name="nickname"
          placeholder="Nickname"
          value={form.nickname}
          onChange={handleChange}
          className="border p-2 w-full"
        />
        <input
          type="text"
          name="department"
          placeholder="Department"
          value={form.department}
          onChange={handleChange}
          className="border p-2 w-full"
        />
        <input
          type="text"
          name="employeeNumber"
          placeholder="Employee Number"
          value={form.employeeNumber}
          onChange={handleChange}
          className="border p-2 w-full"
        />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded">
          Register
        </button>
      </form>
    </div>
  );
}
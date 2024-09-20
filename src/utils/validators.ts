// utils/validators.ts
import * as Yup from 'yup';

export const attendanceSchema = Yup.object().shape({
  employeeId: Yup.string().required('Employee ID is required'),
  checkTime: Yup.date().required('Check time is required'),
  location: Yup.object().shape({
    lat: Yup.number().required('Latitude is required'),
    lng: Yup.number().required('Longitude is required'),
  }),
  isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
});

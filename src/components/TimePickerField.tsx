// components/TimePickerField.tsx

import React from 'react';
import { FieldProps } from 'formik';

interface TimePickerProps extends FieldProps {
  className?: string;
}

const TimePickerField: React.FC<TimePickerProps> = ({
  field,
  form,
  className,
  ...props
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':');
    const roundedMinutes = Math.round(parseInt(minutes) / 30) * 30;
    const formattedTime = `${hours}:${roundedMinutes.toString().padStart(2, '0')}`;
    form.setFieldValue(field.name, formattedTime);
  };

  return (
    <input
      type="time"
      step="1800"
      {...field}
      {...props}
      className={className}
      onChange={handleChange}
    />
  );
};

export default TimePickerField;

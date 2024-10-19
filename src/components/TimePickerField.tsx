import React, { useEffect, useState } from 'react';
import { FieldProps } from 'formik';
import { Clock } from 'lucide-react';

interface TimePickerProps extends FieldProps {
  className?: string;
  defaultTime?: string; // Allow passing default time prop
}

const TimePickerField: React.FC<TimePickerProps> = ({
  field,
  form,
  className,
  defaultTime = '18:00', // Default to 18:00
  ...props
}) => {
  const [currentTime, setCurrentTime] = useState(defaultTime);

  // On component mount, set the default time in Formik form values
  useEffect(() => {
    form.setFieldValue(field.name, defaultTime);
  }, [form, field.name, defaultTime]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(':');
    const roundedMinutes = Math.round(parseInt(minutes) / 30) * 30;
    const formattedTime = `${hours}:${roundedMinutes.toString().padStart(2, '0')}`;
    form.setFieldValue(field.name, formattedTime); // Update Formik value
    setCurrentTime(formattedTime); // Update local state for display
  };

  // Format the time with AM/PM display
  const formatTime = () => {
    const [hours, minutes] = currentTime.split(':');
    const period = parseInt(hours) >= 12 ? 'PM' : 'AM';
    const formattedHours = String(parseInt(hours) % 12 || 12); // Convert to 12-hour format
    return `${formattedHours}:${minutes} ${period}`;
  };

  return (
    <div className="relative">
      {/* Display button-like box with Clock icon and formatted time */}
      <button
        type="button"
        className={`flex items-center w-full p-2 border rounded ${className}`}
        onClick={() => document.getElementById(field.name)?.click()}
      >
        <Clock className="mr-2 h-4 w-4" />
        <span>{formatTime()}</span> {/* Display formatted time */}
      </button>

      {/* Hidden time input that opens when the user clicks the button */}
      <input
        type="time"
        id={field.name}
        step="1800"
        {...field}
        {...props}
        className="sr-only"
        onChange={handleChange}
        value={currentTime} // Bind input to local state
      />
    </div>
  );
};

export default TimePickerField;

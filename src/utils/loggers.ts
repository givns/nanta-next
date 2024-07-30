import winston from 'winston';

export const createLogger = (service: string) => {
  return winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' }),
    ],
  });
};

const attendanceLogger = createLogger('attendance');

export function logTimeConversion(
  stage: string,
  original: any,
  converted: any,
) {
  attendanceLogger.debug('Time conversion', { stage, original, converted });
}

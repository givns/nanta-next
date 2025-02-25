// utils/ServiceLifecycle.ts
import { redisManager } from '../services/RedisConnectionManager';
import { getServiceQueue } from './ServiceInitializationQueue';
import { QueueManager } from './QueueManager';
import { AttendanceStateManager } from '../services/Attendance/AttendanceStateManager';

/**
 * Utility class to handle lifecycle events for all services
 * Can be used during server shutdown or for controlled restarts
 */
export class ServiceLifecycle {
  /**
   * Gracefully shuts down all services to prevent connection leaks
   */
  static async shutdownAllServices(): Promise<void> {
    console.log('Beginning graceful shutdown of all services...');

    try {
      // Get service instances
      const serviceQueue = getServiceQueue();
      const queueManager = QueueManager.getInstance();
      const stateManager = AttendanceStateManager.getInstance();

      // Execute cleanup in parallel
      await Promise.allSettled([
        // Clean up state manager
        stateManager.cleanup().catch((err) => {
          console.error('Error during AttendanceStateManager cleanup:', err);
        }),

        // Clean up queue manager
        queueManager.cleanup().catch((err) => {
          console.error('Error during QueueManager cleanup:', err);
        }),

        // Finally clean up Redis connections
        redisManager.cleanup().catch((err) => {
          console.error('Error during Redis connection cleanup:', err);
        }),
      ]);

      console.log('All services shut down successfully');
    } catch (error) {
      console.error('Error shutting down services:', error);
      throw error;
    }
  }

  /**
   * Resets all connections and services
   * Useful for recovering from connection limit errors
   */
  static async resetAllConnections(): Promise<void> {
    console.log('Resetting all connections...');

    try {
      // Shut down all services first
      await ServiceLifecycle.shutdownAllServices();

      // Force re-initialization of Redis
      await redisManager.initialize();

      // Force re-initialization of service queue
      const serviceQueue = getServiceQueue();
      await serviceQueue.reinitialize();

      console.log('All connections reset successfully');
    } catch (error) {
      console.error('Error resetting connections:', error);
      throw error;
    }
  }
}

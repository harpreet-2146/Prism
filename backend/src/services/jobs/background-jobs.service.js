const { PrismaClient } = require('@prisma/client');
const config = require('../../config');
const logger = require('../../utils/logger');
const documentsService = require('../documents.service');
const exportService = require('../export.service');
const notificationService = require('../notification.service');

const prisma = new PrismaClient();

class BackgroundJobsService {
  constructor() {
    this.jobs = new Map();
    this.running = false;
    this.intervals = new Map();
    
    // Job handlers
    this.jobHandlers = {
      'document-processing': this.processDocumentJob.bind(this),
      'export-generation': this.processExportJob.bind(this),
      'cleanup-expired': this.processCleanupJob.bind(this),
      'notification-delivery': this.processNotificationJob.bind(this),
      'user-activity-sync': this.processUserActivityJob.bind(this)
    };

    // Default job schedules (in milliseconds)
    this.schedules = {
      'document-processing': 5000,    // Check every 5 seconds
      'export-generation': 10000,     // Check every 10 seconds  
      'cleanup-expired': 3600000,     // Run every hour
      'notification-delivery': 30000, // Check every 30 seconds
      'user-activity-sync': 300000    // Run every 5 minutes
    };
  }

  /**
   * Start background job processing
   */
  async start() {
    if (this.running) {
      logger.warn('Background jobs already running');
      return;
    }

    this.running = true;
    logger.info('Starting background job processing');

    // Start each job type
    for (const [jobType, interval] of Object.entries(this.schedules)) {
      this.startJobSchedule(jobType, interval);
    }

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Start individual job schedule
   */
  startJobSchedule(jobType, interval) {
    if (this.intervals.has(jobType)) {
      clearInterval(this.intervals.get(jobType));
    }

    const intervalId = setInterval(async () => {
      try {
        await this.processJobType(jobType);
      } catch (error) {
        logger.error(`Background job error (${jobType}):`, error);
      }
    }, interval);

    this.intervals.set(jobType, intervalId);
    logger.info(`Started job schedule: ${jobType} (${interval}ms)`);
  }

  /**
   * Process jobs of specific type
   */
  async processJobType(jobType) {
    const handler = this.jobHandlers[jobType];
    if (!handler) {
      logger.warn(`No handler for job type: ${jobType}`);
      return;
    }

    try {
      const processed = await handler();
      
      if (processed > 0) {
        logger.debug(`Processed ${processed} ${jobType} jobs`);
      }

      return processed;

    } catch (error) {
      logger.error(`Job processing error (${jobType}):`, error);
      return 0;
    }
  }

  /**
   * Process document processing jobs
   */
  async processDocumentJob() {
    try {
      // Find pending documents
      const pendingDocuments = await prisma.document.findMany({
        where: {
          status: 'PENDING'
        },
        take: 5, // Process 5 at a time
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (pendingDocuments.length === 0) {
        return 0;
      }

      // Process each document
      let processed = 0;
      for (const document of pendingDocuments) {
        try {
          await documentsService.processDocumentAsync(document.id);
          processed++;
          
          logger.info('Document processed by background job', {
            documentId: document.id,
            filename: document.originalName
          });

          // Send notification
          await notificationService.notifyDocumentProcessed(
            document.userId,
            document.id,
            'COMPLETED'
          );

        } catch (error) {
          logger.error('Document processing failed:', error);
          
          // Mark as failed
          await prisma.document.update({
            where: { id: document.id },
            data: {
              status: 'FAILED',
              processingError: error.message
            }
          });

          processed++;
        }
      }

      return processed;

    } catch (error) {
      logger.error('Process document job error:', error);
      return 0;
    }
  }

  /**
   * Process export generation jobs
   */
  async processExportJob() {
    try {
      // Find pending exports
      const pendingExports = await prisma.exportJob.findMany({
        where: {
          status: 'PENDING',
          startedAt: {
            lte: new Date() // Only process jobs scheduled for now or past
          }
        },
        take: 3, // Process 3 at a time
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (pendingExports.length === 0) {
        return 0;
      }

      let processed = 0;
      for (const exportJob of pendingExports) {
        try {
          await exportService.processExportAsync(exportJob.id);
          processed++;

          logger.info('Export processed by background job', {
            exportId: exportJob.id,
            type: exportJob.type,
            format: exportJob.format
          });

          // Check final status and send notification
          const updatedExport = await prisma.exportJob.findUnique({
            where: { id: exportJob.id }
          });

          if (updatedExport.status === 'COMPLETED') {
            await notificationService.notifyExportCompleted(
              exportJob.userId,
              exportJob.id
            );
          } else if (updatedExport.status === 'FAILED') {
            await notificationService.notifyExportFailed(
              exportJob.userId,
              exportJob.id,
              updatedExport.error || 'Unknown error'
            );
          }

        } catch (error) {
          logger.error('Export processing failed:', error);
          processed++;
        }
      }

      return processed;

    } catch (error) {
      logger.error('Process export job error:', error);
      return 0;
    }
  }

  /**
   * Process cleanup jobs
   */
  async processCleanupJob() {
    try {
      let totalCleaned = 0;

      // Cleanup expired exports
      const expiredExports = await exportService.cleanupExpiredExports();
      totalCleaned += expiredExports;

      // Cleanup expired refresh tokens
      const expiredTokens = await this.cleanupExpiredTokens();
      totalCleaned += expiredTokens;

      // Cleanup old notifications
      const oldNotifications = await notificationService.cleanupOldNotifications(30);
      totalCleaned += oldNotifications;

      // Cleanup temporary files
      const tempFiles = await this.cleanupTempFiles();
      totalCleaned += tempFiles;

      if (totalCleaned > 0) {
        logger.info('Cleanup job completed', {
          expiredExports,
          expiredTokens,
          oldNotifications,
          tempFiles,
          total: totalCleaned
        });
      }

      return totalCleaned;

    } catch (error) {
      logger.error('Process cleanup job error:', error);
      return 0;
    }
  }

  /**
   * Process notification delivery jobs
   */
  async processNotificationJob() {
    try {
      // Find failed notifications to retry
      const failedNotifications = await this.getFailedNotifications();
      
      if (failedNotifications.length === 0) {
        return 0;
      }

      let processed = 0;
      for (const notification of failedNotifications) {
        try {
          await this.retryNotification(notification);
          processed++;
        } catch (error) {
          logger.error('Notification retry failed:', error);
        }
      }

      return processed;

    } catch (error) {
      logger.error('Process notification job error:', error);
      return 0;
    }
  }

  /**
   * Process user activity sync jobs
   */
  async processUserActivityJob() {
    try {
      // Update user activity metrics
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          lastLoginAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Active in last 7 days
          }
        },
        take: 50 // Process 50 users at a time
      });

      let processed = 0;
      for (const user of users) {
        try {
          await this.syncUserActivity(user.id);
          processed++;
        } catch (error) {
          logger.error('User activity sync failed:', error);
        }
      }

      return processed;

    } catch (error) {
      logger.error('Process user activity job error:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired refresh tokens
   */
  async cleanupExpiredTokens() {
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      return result.count;

    } catch (error) {
      logger.error('Cleanup expired tokens error:', error);
      return 0;
    }
  }

  /**
   * Cleanup temporary files
   */
  async cleanupTempFiles() {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const tempDir = path.join(config.uploads.directory, 'temp');
      const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      
      let cleanedCount = 0;

      try {
        const files = await fs.readdir(tempDir);
        
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            cleanedCount++;
          }
        }
      } catch (error) {
        // Temp directory might not exist
        logger.debug('Temp directory cleanup skipped:', error.message);
      }

      return cleanedCount;

    } catch (error) {
      logger.error('Cleanup temp files error:', error);
      return 0;
    }
  }

  /**
   * Get failed notifications for retry
   */
  async getFailedNotifications() {
    // This would query a notification queue or failed notifications table
    // Placeholder implementation
    return [];
  }

  /**
   * Retry failed notification
   */
  async retryNotification(notification) {
    // Retry notification delivery
    logger.info('Retrying notification:', notification.id);
    return true;
  }

  /**
   * Sync user activity metrics
   */
  async syncUserActivity(userId) {
    try {
      const [documentCount, conversationCount, exportCount] = await Promise.all([
        prisma.document.count({ where: { userId } }),
        prisma.conversation.count({ where: { userId } }),
        prisma.exportJob.count({ where: { userId } })
      ]);

      // Update user statistics (if you have a user stats table)
      // await prisma.userStats.upsert({
      //   where: { userId },
      //   create: {
      //     userId,
      //     documentCount,
      //     conversationCount,
      //     exportCount,
      //     lastSyncAt: new Date()
      //   },
      //   update: {
      //     documentCount,
      //     conversationCount,
      //     exportCount,
      //     lastSyncAt: new Date()
      //   }
      // });

      logger.debug('User activity synced', { userId, documentCount, conversationCount, exportCount });
      return true;

    } catch (error) {
      logger.error('Sync user activity error:', error);
      return false;
    }
  }

  /**
   * Add custom job
   */
  addJob(jobType, handler, schedule = 60000) {
    this.jobHandlers[jobType] = handler;
    this.schedules[jobType] = schedule;

    if (this.running) {
      this.startJobSchedule(jobType, schedule);
    }

    logger.info('Custom job added', { jobType, schedule });
  }

  /**
   * Remove job
   */
  removeJob(jobType) {
    if (this.intervals.has(jobType)) {
      clearInterval(this.intervals.get(jobType));
      this.intervals.delete(jobType);
    }

    delete this.jobHandlers[jobType];
    delete this.schedules[jobType];

    logger.info('Job removed', { jobType });
  }

  /**
   * Get job statistics
   */
  async getStats() {
    const stats = {
      running: this.running,
      activeJobs: this.intervals.size,
      jobTypes: Object.keys(this.jobHandlers),
      schedules: this.schedules
    };

    // Add queue statistics
    try {
      stats.queues = {
        pendingDocuments: await prisma.document.count({ where: { status: 'PENDING' } }),
        processingDocuments: await prisma.document.count({ where: { status: 'PROCESSING' } }),
        pendingExports: await prisma.exportJob.count({ where: { status: 'PENDING' } }),
        processingExports: await prisma.exportJob.count({ where: { status: 'PROCESSING' } })
      };
    } catch (error) {
      stats.queues = { error: error.message };
    }

    return stats;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const stats = await this.getStats();
      
      return {
        status: this.running ? 'healthy' : 'stopped',
        stats,
        lastCheck: new Date()
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message,
        lastCheck: new Date()
      };
    }
  }

  /**
   * Shutdown background jobs
   */
  async shutdown() {
    if (!this.running) {
      return;
    }

    logger.info('Shutting down background jobs');
    this.running = false;

    // Clear all intervals
    for (const [jobType, intervalId] of this.intervals.entries()) {
      clearInterval(intervalId);
      logger.info(`Stopped job schedule: ${jobType}`);
    }

    this.intervals.clear();
    logger.info('Background jobs shutdown complete');
  }

  /**
   * Restart all jobs
   */
  async restart() {
    await this.shutdown();
    await this.start();
    logger.info('Background jobs restarted');
  }

  /**
   * Process specific job type manually
   */
  async runJobNow(jobType) {
    if (!this.jobHandlers[jobType]) {
      throw new Error(`Unknown job type: ${jobType}`);
    }

    logger.info(`Running job manually: ${jobType}`);
    const result = await this.processJobType(jobType);
    logger.info(`Manual job completed: ${jobType}, processed: ${result}`);
    
    return result;
  }
}

module.exports = new BackgroundJobsService();
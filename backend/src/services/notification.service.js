const { PrismaClient } = require('@prisma/client');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/error.middleware');

const prisma = new PrismaClient();

class NotificationService {
  constructor() {
    this.channels = {
      email: this.sendEmail.bind(this),
      webhook: this.sendWebhook.bind(this),
      database: this.sendDatabase.bind(this)
    };
    
    this.templates = {
      document_processed: {
        email: {
          subject: 'Document Processing Complete - {{documentName}}',
          body: `Hello {{userName}},

Your document "{{documentName}}" has been successfully processed.

Processing Details:
- Status: {{status}}
- Processing Time: {{processingTime}}
- Extracted Text Length: {{textLength}} characters
{{#if sapMetadata}}
- SAP Transaction Codes Found: {{sapMetadata.tcodeCount}}
- SAP Modules Detected: {{sapMetadata.moduleCount}}
{{/if}}

You can now view and search your document in PRISM.

Best regards,
PRISM Document Management Team`
        }
      },
      export_completed: {
        email: {
          subject: 'Export Ready - {{exportType}}',
          body: `Hello {{userName}},

Your {{exportType}} export is ready for download.

Export Details:
- Format: {{format}}
- Items: {{itemCount}}
- File Size: {{fileSize}}
- Expires: {{expiresAt}}

Download your export from the PRISM dashboard or use the direct link provided.

Best regards,
PRISM Export System`
        }
      },
      export_failed: {
        email: {
          subject: 'Export Failed - {{exportType}}',
          body: `Hello {{userName}},

Unfortunately, your {{exportType}} export has failed to complete.

Error Details:
- Export ID: {{exportId}}
- Error: {{error}}
- Started: {{startedAt}}

Please try again or contact support if the issue persists.

Best regards,
PRISM Support Team`
        }
      }
    };
  }

  /**
   * Send notification through specified channel
   */
  async sendNotification(type, channel, recipient, data = {}, options = {}) {
    try {
      if (!this.channels[channel]) {
        throw new AppError(`Unsupported notification channel: ${channel}`, 400);
      }

      const template = this.getTemplate(type, channel);
      const renderedContent = await this.renderTemplate(template, data);

      const notification = {
        type,
        channel,
        recipient,
        content: renderedContent,
        data,
        options,
        createdAt: new Date()
      };

      // Send through channel
      const result = await this.channels[channel](notification);

      // Log notification
      await this.logNotification({
        ...notification,
        status: result.success ? 'sent' : 'failed',
        response: result,
        sentAt: new Date()
      });

      logger.info('Notification sent', {
        type,
        channel,
        recipient,
        success: result.success
      });

      return result;

    } catch (error) {
      logger.error('Send notification error:', error);
      
      // Log failed notification
      await this.logNotification({
        type,
        channel,
        recipient,
        status: 'failed',
        error: error.message,
        createdAt: new Date()
      });

      throw error;
    }
  }

  /**
   * Get template for notification type and channel
   */
  getTemplate(type, channel) {
    const typeTemplates = this.templates[type];
    if (!typeTemplates) {
      throw new AppError(`No template found for type: ${type}`, 404);
    }

    const channelTemplate = typeTemplates[channel];
    if (!channelTemplate) {
      throw new AppError(`No ${channel} template found for type: ${type}`, 404);
    }

    return channelTemplate;
  }

  /**
   * Render template with data
   */
  async renderTemplate(template, data) {
    const handlebars = require('handlebars');

    // Register helpers
    handlebars.registerHelper('formatDate', (date) => {
      return new Date(date).toLocaleDateString();
    });

    handlebars.registerHelper('formatFileSize', (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    });

    const rendered = {
      subject: template.subject ? handlebars.compile(template.subject)(data) : null,
      body: handlebars.compile(template.body)(data)
    };

    return rendered;
  }

  /**
   * Send email notification
   */
  async sendEmail(notification) {
    try {
      // Placeholder email implementation
      // In production, integrate with email service (SendGrid, AWS SES, etc.)
      
      logger.info('Email notification (placeholder)', {
        to: notification.recipient,
        subject: notification.content.subject,
        bodyLength: notification.content.body.length
      });

      // Simulate email sending
      await this.sleep(100);

      return {
        success: true,
        messageId: `email_${Date.now()}`,
        provider: 'placeholder',
        sentAt: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'placeholder',
        attemptedAt: new Date()
      };
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhook(notification) {
    try {
      const webhookUrl = notification.options.webhookUrl || config.notifications.defaultWebhookUrl;
      
      if (!webhookUrl) {
        throw new Error('No webhook URL configured');
      }

      const payload = {
        type: notification.type,
        recipient: notification.recipient,
        data: notification.data,
        content: notification.content,
        timestamp: notification.createdAt
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PRISM-Notifications/1.0'
        },
        body: JSON.stringify(payload)
      });

      const success = response.ok;
      const responseData = await response.json().catch(() => ({}));

      return {
        success,
        statusCode: response.status,
        response: responseData,
        url: webhookUrl,
        sentAt: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        url: notification.options.webhookUrl,
        attemptedAt: new Date()
      };
    }
  }

  /**
   * Send database notification (in-app)
   */
  async sendDatabase(notification) {
    try {
      // Store notification in database for in-app display
      const dbNotification = await prisma.notification.create({
        data: {
          type: notification.type,
          title: notification.content.subject || `${notification.type} notification`,
          message: notification.content.body,
          recipient: notification.recipient,
          data: notification.data,
          read: false,
          createdAt: notification.createdAt
        }
      });

      return {
        success: true,
        notificationId: dbNotification.id,
        provider: 'database',
        sentAt: new Date()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: 'database',
        attemptedAt: new Date()
      };
    }
  }

  /**
   * Log notification for auditing
   */
  async logNotification(notification) {
    try {
      // Store in audit log or separate notification log
      logger.info('Notification logged', {
        type: notification.type,
        channel: notification.channel,
        recipient: notification.recipient,
        status: notification.status
      });

      // Could also store in database:
      // await prisma.notificationLog.create({ data: notification });

    } catch (error) {
      logger.error('Log notification error:', error);
    }
  }

  /**
   * Send document processing notification
   */
  async notifyDocumentProcessed(userId, documentId, status, processingDetails = {}) {
    try {
      // Get user and document info
      const [user, document] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.document.findUnique({ 
          where: { id: documentId },
          include: { sapMetadata: true }
        })
      ]);

      if (!user || !document) {
        throw new AppError('User or document not found', 404);
      }

      const data = {
        userName: user.fullName,
        userEmail: user.email,
        documentName: document.originalName,
        documentId: document.id,
        status,
        processingTime: processingDetails.processingTime || 'Unknown',
        textLength: document.extractedText?.length || 0,
        sapMetadata: {
          tcodeCount: document.sapMetadata?.tcodes?.length || 0,
          moduleCount: document.sapMetadata?.modules?.length || 0
        }
      };

      // Send through multiple channels
      const results = await Promise.allSettled([
        this.sendNotification('document_processed', 'email', user.email, data),
        this.sendNotification('document_processed', 'database', user.id, data)
      ]);

      return results;

    } catch (error) {
      logger.error('Notify document processed error:', error);
      throw error;
    }
  }

  /**
   * Send export completion notification
   */
  async notifyExportCompleted(userId, exportId) {
    try {
      const [user, exportJob] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.exportJob.findUnique({ where: { id: exportId } })
      ]);

      if (!user || !exportJob) {
        throw new AppError('User or export job not found', 404);
      }

      const data = {
        userName: user.fullName,
        userEmail: user.email,
        exportId: exportJob.id,
        exportType: exportJob.type,
        format: exportJob.format,
        itemCount: exportJob.itemIds.length,
        fileSize: exportJob.fileSize ? this.formatFileSize(exportJob.fileSize) : 'Unknown',
        expiresAt: exportJob.expiresAt ? new Date(exportJob.expiresAt).toLocaleDateString() : 'Not set'
      };

      const results = await Promise.allSettled([
        this.sendNotification('export_completed', 'email', user.email, data),
        this.sendNotification('export_completed', 'database', user.id, data)
      ]);

      return results;

    } catch (error) {
      logger.error('Notify export completed error:', error);
      throw error;
    }
  }

  /**
   * Send export failure notification
   */
  async notifyExportFailed(userId, exportId, error) {
    try {
      const [user, exportJob] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId } }),
        prisma.exportJob.findUnique({ where: { id: exportId } })
      ]);

      if (!user || !exportJob) {
        throw new AppError('User or export job not found', 404);
      }

      const data = {
        userName: user.fullName,
        userEmail: user.email,
        exportId: exportJob.id,
        exportType: exportJob.type,
        error: error.substring(0, 200),
        startedAt: exportJob.startedAt ? new Date(exportJob.startedAt).toLocaleString() : 'Unknown'
      };

      const results = await Promise.allSettled([
        this.sendNotification('export_failed', 'email', user.email, data),
        this.sendNotification('export_failed', 'database', user.id, data)
      ]);

      return results;

    } catch (error) {
      logger.error('Notify export failed error:', error);
      throw error;
    }
  }

  /**
   * Get user notifications from database
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const { page = 1, limit = 20, unreadOnly = false } = options;
      const offset = (page - 1) * limit;

      const where = {
        recipient: userId,
        ...(unreadOnly && { read: false })
      };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit
        }),
        prisma.notification.count({ where })
      ]);

      return {
        notifications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      };

    } catch (error) {
      logger.error('Get user notifications error:', error);
      throw error;
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(userId, notificationIds = []) {
    try {
      const where = {
        recipient: userId,
        ...(notificationIds.length > 0 && { id: { in: notificationIds } })
      };

      const result = await prisma.notification.updateMany({
        where,
        data: { 
          read: true,
          readAt: new Date()
        }
      });

      return {
        updated: result.count
      };

    } catch (error) {
      logger.error('Mark as read error:', error);
      throw error;
    }
  }

  /**
   * Delete old notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
          read: true
        }
      });

      logger.info('Old notifications cleaned up', { 
        deleted: result.count,
        cutoffDate 
      });

      return result.count;

    } catch (error) {
      logger.error('Cleanup old notifications error:', error);
      throw error;
    }
  }

  /**
   * Add custom template
   */
  addTemplate(type, channel, template) {
    if (!this.templates[type]) {
      this.templates[type] = {};
    }

    this.templates[type][channel] = template;

    logger.info('Custom template added', { type, channel });
  }

  /**
   * Get notification statistics
   */
  async getStats(userId = null) {
    try {
      const where = userId ? { recipient: userId } : {};

      const stats = await prisma.notification.groupBy({
        by: ['type', 'read'],
        where,
        _count: { id: true }
      });

      const result = {
        total: 0,
        unread: 0,
        byType: {},
        byStatus: { read: 0, unread: 0 }
      };

      stats.forEach(stat => {
        result.total += stat._count.id;
        result.byStatus[stat.read ? 'read' : 'unread'] += stat._count.id;
        
        if (!result.byType[stat.type]) {
          result.byType[stat.type] = { read: 0, unread: 0, total: 0 };
        }
        
        result.byType[stat.type][stat.read ? 'read' : 'unread'] += stat._count.id;
        result.byType[stat.type].total += stat._count.id;
      });

      result.unread = result.byStatus.unread;

      return result;

    } catch (error) {
      logger.error('Get notification stats error:', error);
      throw error;
    }
  }

  /**
   * Utility: Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testNotification = {
        type: 'test',
        channel: 'database',
        recipient: 'test-user',
        content: { body: 'Health check test' },
        data: {},
        createdAt: new Date()
      };

      const result = await this.sendDatabase(testNotification);

      return {
        status: result.success ? 'healthy' : 'warning',
        channels: Object.keys(this.channels),
        templates: Object.keys(this.templates),
        testResult: result
      };

    } catch (error) {
      return {
        status: 'error',
        message: error.message
      };
    }
  }
}

module.exports = new NotificationService();
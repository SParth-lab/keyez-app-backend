const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SecureMessage = require('../models/SecureMessage');
const FirebaseNotificationService = require('../services/firebaseNotificationService');

const router = express.Router();

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is blocked
    if (user.isUserBlocked()) {
      return res.status(403).json({ 
        error: 'Account is blocked',
        blockReason: user.securityProfile.blockReason
      });
    }

    req.user = user;
    req.sessionToken = decoded.sessionToken;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to require admin role
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * @route POST /api/security/violation
 * @desc Report security violation (screenshot, copy attempt, etc.)
 * @access Private (Users only)
 */
router.post('/violation', authenticateUser, async (req, res) => {
  try {
    const { type, messageId, deviceInfo, additionalData } = req.body;

    // Validate violation type
    const validTypes = ['screenshot_attempt', 'copy_attempt', 'forward_attempt', 'unauthorized_access'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid violation type' });
    }

    // Record violation in user profile
    await req.user.recordSecurityViolation(type, deviceInfo);

    // If related to a specific message, record in message too
    if (messageId) {
      const message = await SecureMessage.findById(messageId);
      if (message) {
        await message.recordSecurityViolation(req.user._id, type, deviceInfo);
      }
    }

    // Send immediate notification to all admins
    const admins = await User.find({ isAdmin: true });
    const notificationPromises = admins.map(admin => 
      FirebaseNotificationService.sendSystemNotification(
        admin._id,
        'Security Violation Alert',
        `User ${req.user.phoneNumber} attempted ${type.replace('_', ' ')}`,
        {
          type: 'security_alert',
          priority: 'urgent',
          userId: req.user._id,
          violationType: type,
          deviceInfo,
          timestamp: new Date().toISOString()
        }
      )
    );

    await Promise.all(notificationPromises);

    // Check if user should be auto-blocked
    const violationCount = req.user.securityProfile.securityViolations.length;
    let response = {
      success: true,
      message: 'Security violation recorded',
      violationCount,
      warning: null
    };

    if (violationCount >= 2 && violationCount < 3) {
      response.warning = 'WARNING: Multiple security violations detected. One more violation will result in account suspension.';
    } else if (violationCount >= 3) {
      response.warning = 'ACCOUNT BLOCKED: Too many security violations. Please contact administrator.';
    }

    res.json(response);

  } catch (error) {
    console.error('Security violation reporting error:', error);
    res.status(500).json({ error: 'Failed to report security violation' });
  }
});

/**
 * @route GET /api/security/violations
 * @desc Get security violations (Admin only)
 * @access Private (Admin only)
 */
router.get('/violations', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, type, timeframe } = req.query;
    const skip = (page - 1) * limit;

    // Build query filters
    let matchQuery = {};
    
    if (userId) {
      matchQuery._id = userId;
    }
    
    if (type) {
      matchQuery['securityProfile.securityViolations.type'] = type;
    }
    
    if (timeframe) {
      const hours = parseInt(timeframe);
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      matchQuery['securityProfile.securityViolations.timestamp'] = { $gte: since };
    }

    // Aggregate violations data
    const pipeline = [
      { $match: matchQuery },
      { $unwind: '$securityProfile.securityViolations' },
      {
        $project: {
          phoneNumber: 1,
          isAdmin: 1,
          violation: '$securityProfile.securityViolations',
          isBlocked: '$securityProfile.isBlocked',
          blockReason: '$securityProfile.blockReason'
        }
      },
      { $sort: { 'violation.timestamp': -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ];

    const violations = await User.aggregate(pipeline);

    // Get total count
    const countPipeline = [
      { $match: matchQuery },
      { $unwind: '$securityProfile.securityViolations' },
      { $count: 'total' }
    ];
    
    const countResult = await User.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].total : 0;

    // Get violation statistics
    const stats = await User.aggregate([
      { $match: { 'securityProfile.securityViolations.0': { $exists: true } } },
      { $unwind: '$securityProfile.securityViolations' },
      {
        $group: {
          _id: '$securityProfile.securityViolations.type',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          type: '$_id',
          count: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      }
    ]);

    res.json({
      success: true,
      violations,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasMore: skip + violations.length < totalCount
      },
      statistics: stats
    });

  } catch (error) {
    console.error('Get violations error:', error);
    res.status(500).json({ error: 'Failed to get violations' });
  }
});

/**
 * @route GET /api/security/user/:userId
 * @desc Get security profile for specific user (Admin only)
 * @access Private (Admin only)
 */
router.get('/user/:userId', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const securityProfile = {
      userId: user._id,
      phoneNumber: user.phoneNumber,
      isBlocked: user.securityProfile?.isBlocked || false,
      blockReason: user.securityProfile?.blockReason,
      blockedAt: user.securityProfile?.blockedAt,
      screenshotAttempts: user.securityProfile?.screenshotAttempts || 0,
      copyAttempts: user.securityProfile?.copyAttempts || 0,
      totalViolations: user.securityProfile?.securityViolations?.length || 0,
      violations: user.securityProfile?.securityViolations || [],
      activeSession: user.activeSession ? {
        deviceFingerprint: user.activeSession.deviceFingerprint,
        loginTime: user.activeSession.loginTime,
        deviceInfo: user.activeSession.deviceInfo,
        isActive: user.activeSession.isActive
      } : null,
      lastSeen: user.lastSeen,
      isOnline: user.isOnline
    };

    res.json({
      success: true,
      securityProfile
    });

  } catch (error) {
    console.error('Get user security profile error:', error);
    res.status(500).json({ error: 'Failed to get user security profile' });
  }
});

/**
 * @route POST /api/security/block-user
 * @desc Block user account (Admin only)
 * @access Private (Admin only)
 */
router.post('/block-user', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!userId || !reason) {
      return res.status(400).json({ error: 'User ID and block reason are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.isAdmin) {
      return res.status(400).json({ error: 'Cannot block admin users' });
    }

    // Block user
    if (!user.securityProfile) {
      user.securityProfile = { securityViolations: [] };
    }
    
    user.securityProfile.isBlocked = true;
    user.securityProfile.blockReason = reason;
    user.securityProfile.blockedAt = new Date();

    // Revoke active session
    await user.revokeDeviceSession();
    await user.save();

    // Send notification to user (if not blocked for security reasons)
    try {
      await FirebaseNotificationService.sendSystemNotification(
        user._id,
        'Account Suspended',
        `Your account has been suspended. Reason: ${reason}`,
        {
          type: 'account_blocked',
          priority: 'urgent',
          blockReason: reason
        }
      );
    } catch (notifError) {
      console.log('Could not send block notification to user:', notifError.message);
    }

    res.json({
      success: true,
      message: 'User blocked successfully',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isBlocked: true,
        blockReason: reason,
        blockedAt: user.securityProfile.blockedAt
      }
    });

  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Failed to block user' });
  }
});

/**
 * @route POST /api/security/unblock-user
 * @desc Unblock user account (Admin only)
 * @access Private (Admin only)
 */
router.post('/unblock-user', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Unblock user
    await user.unblockUser();

    // Send notification to user
    try {
      await FirebaseNotificationService.sendSystemNotification(
        user._id,
        'Account Restored',
        'Your account has been restored. Please follow security guidelines.',
        {
          type: 'account_unblocked',
          priority: 'normal'
        }
      );
    } catch (notifError) {
      console.log('Could not send unblock notification to user:', notifError.message);
    }

    res.json({
      success: true,
      message: 'User unblocked successfully',
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        isBlocked: false
      }
    });

  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

/**
 * @route GET /api/security/dashboard
 * @desc Get security dashboard data (Admin only)
 * @access Private (Admin only)
 */
router.get('/dashboard', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get security statistics
    const [
      totalUsers,
      blockedUsers,
      violations24h,
      violations7d,
      activeUsers,
      recentViolations
    ] = await Promise.all([
      User.countDocuments({ isAdmin: false }),
      User.countDocuments({ 'securityProfile.isBlocked': true }),
      User.aggregate([
        { $unwind: '$securityProfile.securityViolations' },
        { $match: { 'securityProfile.securityViolations.timestamp': { $gte: last24h } } },
        { $count: 'count' }
      ]),
      User.aggregate([
        { $unwind: '$securityProfile.securityViolations' },
        { $match: { 'securityProfile.securityViolations.timestamp': { $gte: last7d } } },
        { $count: 'count' }
      ]),
      User.countDocuments({ 
        isAdmin: false,
        'activeSession.isActive': true,
        lastSeen: { $gte: last24h }
      }),
      User.aggregate([
        { $match: { 'securityProfile.securityViolations.0': { $exists: true } } },
        { $unwind: '$securityProfile.securityViolations' },
        { $sort: { 'securityProfile.securityViolations.timestamp': -1 } },
        { $limit: 10 },
        {
          $project: {
            phoneNumber: 1,
            violation: '$securityProfile.securityViolations',
            isBlocked: '$securityProfile.isBlocked'
          }
        }
      ])
    ]);

    // Get violation type breakdown
    const violationTypes = await User.aggregate([
      { $unwind: '$securityProfile.securityViolations' },
      { $match: { 'securityProfile.securityViolations.timestamp': { $gte: last7d } } },
      {
        $group: {
          _id: '$securityProfile.securityViolations.type',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      dashboard: {
        overview: {
          totalUsers,
          blockedUsers,
          activeUsers,
          violations24h: violations24h[0]?.count || 0,
          violations7d: violations7d[0]?.count || 0
        },
        violationTypes,
        recentViolations,
        lastUpdated: now
      }
    });

  } catch (error) {
    console.error('Get security dashboard error:', error);
    res.status(500).json({ error: 'Failed to get security dashboard' });
  }
});

module.exports = router;

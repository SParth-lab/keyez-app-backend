const express = require('express');
const jwt = require('jsonwebtoken');
const Group = require('../models/Group');
const User = require('../models/User');

const router = express.Router();

// Middleware to verify admin role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Validation helpers
const ensureAtLeastThreeMembers = (members) => Array.isArray(members) && members.length >= 3;

// Create group (admin only)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, members } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return res.status(400).json({ error: 'Valid group name (min 3 chars) is required' });
    }
    if (!ensureAtLeastThreeMembers(members)) {
      return res.status(400).json({ error: 'Group must have at least 3 members' });
    }

    // Validate members exist and are regular users (isAdmin = false)
    const uniqueMemberIds = [...new Set(members.map((m) => m.toString()))];
    const foundMembers = await User.find({ _id: { $in: uniqueMemberIds } });
    if (foundMembers.length !== uniqueMemberIds.length) {
      return res.status(400).json({ error: 'One or more members not found' });
    }
    const hasAdminMember = foundMembers.some((u) => u.isAdmin);
    if (hasAdminMember) {
      return res.status(400).json({ error: 'Members must be regular users (isAdmin = false)' });
    }

    const group = new Group({
      name: name.trim(),
      members: uniqueMemberIds,
      createdBy: req.user._id,
    });
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin');

    res.status(201).json({
      message: 'Group created successfully',
      group: populated.getPublicData(),
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Edit group (admin only)
router.put('/:groupId', requireAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, members, isActive } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 3) {
        return res.status(400).json({ error: 'Valid group name (min 3 chars) is required' });
      }
      group.name = name.trim();
    }

    if (members !== undefined) {
      if (!ensureAtLeastThreeMembers(members)) {
        return res.status(400).json({ error: 'Group must have at least 3 members' });
      }
      const uniqueMemberIds = [...new Set(members.map((m) => m.toString()))];
      const foundMembers = await User.find({ _id: { $in: uniqueMemberIds } });
      if (foundMembers.length !== uniqueMemberIds.length) {
        return res.status(400).json({ error: 'One or more members not found' });
      }
      const hasAdminMember = foundMembers.some((u) => u.isAdmin);
      if (hasAdminMember) {
        return res.status(400).json({ error: 'Members must be regular users (isAdmin = false)' });
      }
      group.members = uniqueMemberIds;
    }

    if (typeof isActive === 'boolean') {
      group.isActive = isActive;
    }

    await group.save();

    const populated = await Group.findById(group._id)
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin');

    res.json({
      message: 'Group updated successfully',
      group: populated.getPublicData(),
    });
  } catch (error) {
    console.error('Edit group error:', error);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// Delete group (admin only)
router.delete('/:groupId', requireAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    await Group.findByIdAndDelete(groupId);

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// Get all groups (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const groups = await Group.find(query)
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    const total = await Group.countDocuments(query);
    res.json({
      groups: groups.map((g) => g.getPublicData()),
      total,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('List groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get one group (admin only)
router.get('/:groupId', requireAdmin, async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await Group.findById(groupId)
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin');
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ group: group.getPublicData() });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Get current user's groups (member access)
router.get('/me/list', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const groups = await Group.find({ members: user._id, isActive: true })
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin')
      .sort({ createdAt: -1 });

    res.json({ groups: groups.map((g) => g.getPublicData()), total: groups.length });
  } catch (error) {
    console.error('Get my groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// Get a specific group by name if current user is a member
router.get('/me/by-name/:name', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name } = req.params;
    const group = await Group.findOne({ name, members: user._id, isActive: true })
      .populate('members', 'username isAdmin')
      .populate('createdBy', 'username isAdmin');
    if (!group) return res.status(404).json({ error: 'Group not found or access denied' });
    res.json({ group: group.getPublicData() });
  } catch (error) {
    console.error('Get my group by name error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

module.exports = router;



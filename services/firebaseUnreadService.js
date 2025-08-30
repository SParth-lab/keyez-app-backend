const { getDatabase } = require('../config/firebase');

/**
 * Firebase Unread Count Service
 * Manages unread message counts in Firebase Realtime Database
 * 
 * Firebase Structure:
 * unread_counts: {
 *   userId: {
 *     direct: {
 *       partnerId: count
 *     },
 *     groups: {
 *       groupId: count
 *     }
 *   }
 * }
 */

class FirebaseUnreadService {
  constructor() {
    this.database = null;
    this._initialized = false;
  }

  /**
   * Lazy initialization of Firebase database
   */
  _initializeDatabase() {
    if (this._initialized) return this.database;
    
    try {
      this.database = getDatabase();
      this._initialized = true;
      console.log('✅ Firebase Unread Service: Database initialized successfully');
      return this.database;
    } catch (error) {
      console.warn('⚠️ Firebase Unread Service: Database not available:', error.message);
      this.database = null;
      return null;
    }
  }

  /**
   * Check if Firebase is available
   */
  isAvailable() {
    const db = this._initializeDatabase();
    return db !== null;
  }

  /**
   * Increment unread count for a direct message
   * @param {string} userId - User who will receive the message
   * @param {string} fromUserId - User who sent the message
   */
  async incrementDirectUnreadCount(userId, fromUserId) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const ref = database.ref(`unread_counts/${userId}/direct/${fromUserId}`);
      const snapshot = await ref.once('value');
      const currentCount = snapshot.val() || 0;
      
      await ref.set(currentCount + 1);
      
      console.log(`✅ Firebase: Incremented unread count for user ${userId} from ${fromUserId}: ${currentCount + 1}`);
      
      // Also update total unread count
      await this.updateTotalUnreadCount(userId);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to increment direct unread count:', error);
    }
  }

  /**
   * Increment unread count for a group message
   * @param {string} groupId - Group ID
   * @param {string} fromUserId - User who sent the message
   * @param {Array} memberIds - Array of group member IDs
   */
  async incrementGroupUnreadCount(groupId, fromUserId, memberIds) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const promises = memberIds
        .filter(memberId => memberId.toString() !== fromUserId.toString()) // Don't increment for sender
        .map(async (memberId) => {
          const ref = database.ref(`unread_counts/${memberId}/groups/${groupId}`);
          const snapshot = await ref.once('value');
          const currentCount = snapshot.val() || 0;
          
          await ref.set(currentCount + 1);
          console.log(`✅ Firebase: Incremented group unread count for user ${memberId} in group ${groupId}: ${currentCount + 1}`);
          
          // Update total unread count for this user
          return this.updateTotalUnreadCount(memberId);
        });

      await Promise.all(promises);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to increment group unread count:', error);
    }
  }

  /**
   * Clear unread count for direct messages
   * @param {string} userId - User whose unread count to clear
   * @param {string} partnerId - Partner user ID
   */
  async clearDirectUnreadCount(userId, partnerId) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const ref = database.ref(`unread_counts/${userId}/direct/${partnerId}`);
      await ref.remove();
      
      console.log(`✅ Firebase: Cleared direct unread count for user ${userId} with partner ${partnerId}`);
      
      // Update total unread count
      await this.updateTotalUnreadCount(userId);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to clear direct unread count:', error);
    }
  }

  /**
   * Clear unread count for group messages
   * @param {string} userId - User whose unread count to clear
   * @param {string} groupId - Group ID
   */
  async clearGroupUnreadCount(userId, groupId) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const ref = database.ref(`unread_counts/${userId}/groups/${groupId}`);
      await ref.remove();
      
      console.log(`✅ Firebase: Cleared group unread count for user ${userId} in group ${groupId}`);
      
      // Update total unread count
      await this.updateTotalUnreadCount(userId);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to clear group unread count:', error);
    }
  }

  /**
   * Get all unread counts for a user
   * @param {string} userId - User ID
   * @returns {Object} Unread counts object
   */
  async getUserUnreadCounts(userId) {
    const database = this._initializeDatabase();
    if (!database) return { direct: {}, groups: {}, total: 0 };

    try {
      const ref = database.ref(`unread_counts/${userId}`);
      const snapshot = await ref.once('value');
      const data = snapshot.val() || { direct: {}, groups: {} };
      
      // Calculate total
      const directTotal = Object.values(data.direct || {}).reduce((sum, count) => sum + count, 0);
      const groupsTotal = Object.values(data.groups || {}).reduce((sum, count) => sum + count, 0);
      const total = directTotal + groupsTotal;
      
      return {
        direct: data.direct || {},
        groups: data.groups || {},
        total: total
      };
      
    } catch (error) {
      console.error('❌ Firebase: Failed to get user unread counts:', error);
      return { direct: {}, groups: {}, total: 0 };
    }
  }

  /**
   * Get unread count for specific direct chat
   * @param {string} userId - User ID
   * @param {string} partnerId - Partner user ID
   * @returns {number} Unread count
   */
  async getDirectUnreadCount(userId, partnerId) {
    const database = this._initializeDatabase();
    if (!database) return 0;

    try {
      const ref = database.ref(`unread_counts/${userId}/direct/${partnerId}`);
      const snapshot = await ref.once('value');
      return snapshot.val() || 0;
      
    } catch (error) {
      console.error('❌ Firebase: Failed to get direct unread count:', error);
      return 0;
    }
  }

  /**
   * Get unread count for specific group
   * @param {string} userId - User ID
   * @param {string} groupId - Group ID
   * @returns {number} Unread count
   */
  async getGroupUnreadCount(userId, groupId) {
    const database = this._initializeDatabase();
    if (!database) return 0;

    try {
      const ref = database.ref(`unread_counts/${userId}/groups/${groupId}`);
      const snapshot = await ref.once('value');
      return snapshot.val() || 0;
      
    } catch (error) {
      console.error('❌ Firebase: Failed to get group unread count:', error);
      return 0;
    }
  }

  /**
   * Update total unread count for a user
   * @param {string} userId - User ID
   */
  async updateTotalUnreadCount(userId) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const counts = await this.getUserUnreadCounts(userId);
      const ref = database.ref(`unread_counts/${userId}/total`);
      await ref.set(counts.total);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to update total unread count:', error);
    }
  }

  /**
   * Clear all unread counts for a user
   * @param {string} userId - User ID
   */
  async clearAllUnreadCounts(userId) {
    const database = this._initializeDatabase();
    if (!database) return;

    try {
      const ref = database.ref(`unread_counts/${userId}`);
      await ref.remove();
      
      console.log(`✅ Firebase: Cleared all unread counts for user ${userId}`);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to clear all unread counts:', error);
    }
  }

  /**
   * Get total unread count for a user
   * @param {string} userId - User ID
   * @returns {number} Total unread count
   */
  async getTotalUnreadCount(userId) {
    if (!this.isAvailable()) return 0;

    try {
      const counts = await this.getUserUnreadCounts(userId);
      return counts.total;
      
    } catch (error) {
      console.error('❌ Firebase: Failed to get total unread count:', error);
      return 0;
    }
  }

  /**
   * Set up real-time listener for user's unread counts
   * @param {string} userId - User ID
   * @param {Function} callback - Callback function to handle changes
   * @returns {Function} Unsubscribe function
   */
  onUnreadCountsChange(userId, callback) {
    const database = this._initializeDatabase();
    if (!database) {
      return () => {}; // Return empty unsubscribe function
    }

    try {
      const ref = database.ref(`unread_counts/${userId}`);
      
      const listener = ref.on('value', (snapshot) => {
        const data = snapshot.val() || { direct: {}, groups: {} };
        
        // Calculate total
        const directTotal = Object.values(data.direct || {}).reduce((sum, count) => sum + count, 0);
        const groupsTotal = Object.values(data.groups || {}).reduce((sum, count) => sum + count, 0);
        const total = directTotal + groupsTotal;
        
        callback({
          direct: data.direct || {},
          groups: data.groups || {},
          total: total
        });
      });

      // Return unsubscribe function
      return () => ref.off('value', listener);
      
    } catch (error) {
      console.error('❌ Firebase: Failed to set up unread counts listener:', error);
      return () => {};
    }
  }
}

// Create singleton instance
const firebaseUnreadService = new FirebaseUnreadService();

module.exports = firebaseUnreadService;

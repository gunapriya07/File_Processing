// Storage quota management for per-user limits

const storageQuotas = new Map();

// Default quota: 100MB per user
const DEFAULT_QUOTA = 100 * 1024 * 1024;

function initializeQuota(userId, quotaSize = DEFAULT_QUOTA) {
  if (!storageQuotas.has(userId)) {
    storageQuotas.set(userId, {
      userId: userId,
      totalQuota: quotaSize,
      usedSpace: 0,
      files: [],
      createdAt: new Date().toISOString()
    });
  }
  return storageQuotas.get(userId);
}

function getQuota(userId) {
  return storageQuotas.get(userId) || initializeQuota(userId);
}

function addFile(userId, fileId, fileSize) {
  const quota = initializeQuota(userId);
  
  // Check if adding file would exceed quota
  if (quota.usedSpace + fileSize > quota.totalQuota) {
    return {
      success: false,
      error: 'Storage quota exceeded',
      message: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB would exceed quota. Used: ${(quota.usedSpace / 1024 / 1024).toFixed(2)}MB / Available: ${((quota.totalQuota - quota.usedSpace) / 1024 / 1024).toFixed(2)}MB`,
      usedSpace: quota.usedSpace,
      availableSpace: quota.totalQuota - quota.usedSpace
    };
  }

  quota.usedSpace += fileSize;
  quota.files.push({
    fileId: fileId,
    size: fileSize,
    addedAt: new Date().toISOString()
  });

  return {
    success: true,
    usedSpace: quota.usedSpace,
    availableSpace: quota.totalQuota - quota.usedSpace,
    remainingQuotaPercent: Math.round((quota.usedSpace / quota.totalQuota) * 100)
  };
}

function removeFile(userId, fileId, fileSize) {
  const quota = getQuota(userId);
  
  if (!quota) {
    return { success: false, error: 'Quota not found' };
  }

  // Remove file from list
  quota.files = quota.files.filter(f => f.fileId !== fileId);
  
  // Reduce used space
  quota.usedSpace = Math.max(0, quota.usedSpace - fileSize);

  return {
    success: true,
    usedSpace: quota.usedSpace,
    availableSpace: quota.totalQuota - quota.usedSpace,
    remainingQuotaPercent: Math.round((quota.usedSpace / quota.totalQuota) * 100)
  };
}

function getQuotaStatus(userId) {
  const quota = getQuota(userId);

  return {
    userId: userId,
    totalQuota: quota.totalQuota,
    usedSpace: quota.usedSpace,
    availableSpace: quota.totalQuota - quota.usedSpace,
    quotaPercent: Math.round((quota.usedSpace / quota.totalQuota) * 100),
    fileCount: quota.files.length,
    quotaExceeded: quota.usedSpace > quota.totalQuota
  };
}

function resetQuota(userId) {
  storageQuotas.delete(userId);
  return initializeQuota(userId);
}

function updateQuotaLimit(userId, newQuotaSize) {
  const quota = getQuota(userId);
  quota.totalQuota = newQuotaSize;
  return quota;
}

function getTopUsers(limit = 10) {
  const users = Array.from(storageQuotas.values())
    .sort((a, b) => b.usedSpace - a.usedSpace)
    .slice(0, limit);

  return users.map(user => ({
    userId: user.userId,
    usedSpace: user.usedSpace,
    quotaPercent: Math.round((user.usedSpace / user.totalQuota) * 100),
    fileCount: user.files.length
  }));
}

module.exports = {
  initializeQuota,
  getQuota,
  addFile,
  removeFile,
  getQuotaStatus,
  resetQuota,
  updateQuotaLimit,
  getTopUsers,
  DEFAULT_QUOTA
};

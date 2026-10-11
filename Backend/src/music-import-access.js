function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function hasMusicImportAccess(user, adminEmail) {
  const allowedEmail = normalizeEmail(adminEmail)
  if (!allowedEmail || !user?.googleSub || !user.providers?.includes('google')) return false
  return normalizeEmail(user.email) === allowedEmail
}

module.exports = { hasMusicImportAccess }

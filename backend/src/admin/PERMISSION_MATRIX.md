# Admin Permission Matrix

## Overview

This document provides a comprehensive mapping of admin roles to their permissions, along with audit workflow details for all admin actions in the VibePay platform.

## Role-Permission Matrix

| Permission | Super Admin | Moderator | Support | Analyst | Description |
|------------|-------------|-----------|---------|---------|-------------|
| **User Management** |
| `view_users` | ✅ | ✅ | ✅ | ✅ | View user list and details |
| `ban_users` | ✅ | ✅ | ❌ | ❌ | Ban user accounts |
| `unban_users` | ✅ | ✅ | ❌ | ❌ | Unban user accounts |
| `force_reset_user` | ✅ | ❌ | ❌ | ❌ | Force password reset for users |
| **Artist Management** |
| `view_artists` | ✅ | ✅ | ✅ | ✅ | View artist list and details |
| `verify_artists` | ✅ | ✅ | ❌ | ❌ | Verify artist accounts |
| `unverify_artists` | ✅ | ✅ | ❌ | ❌ | Remove artist verification |
| `suspend_artists` | ✅ | ✅ | ❌ | ❌ | Suspend artist accounts |
| **Content Management** |
| `view_tracks` | ✅ | ✅ | ✅ | ✅ | View track list and details |
| `remove_tracks` | ✅ | ✅ | ❌ | ❌ | Remove tracks from platform |
| `add_warning_label` | ✅ | ✅ | ❌ | ❌ | Add content warning labels |
| **Reports Management** |
| `view_reports` | ✅ | ✅ | ✅ | ❌ | View user reports |
| `resolve_reports` | ✅ | ✅ | ✅ | ❌ | Resolve user reports |
| **Analytics** |
| `view_stats` | ✅ | ✅ | ❌ | ✅ | View platform statistics |
| `view_audit_logs` | ✅ | ❌ | ❌ | ✅ | View admin action audit logs |
| **Admin Management** |
| `manage_admins` | ✅ | ❌ | ❌ | ❌ | Manage admin roles and permissions |

## Role Definitions

### Super Admin
- **Scope**: Full platform access
- **Permissions**: All 15 permissions
- **Use Case**: Platform owners, system administrators
- **Capabilities**: Can manage other admins, perform any action on the platform

### Moderator
- **Scope**: Content and user moderation
- **Permissions**: 11 permissions (no admin management, force reset, audit logs)
- **Use Case**: Community moderators, content managers
- **Capabilities**: Full moderation powers, user management, content control

### Support
- **Scope**: Customer support and basic moderation
- **Permissions**: 5 permissions (view-only + report resolution)
- **Use Case**: Customer support representatives
- **Capabilities**: View all content, resolve reports, no destructive actions

### Analyst
- **Scope**: Data analysis and monitoring
- **Permissions**: 5 permissions (view-only + analytics)
- **Use Case**: Data analysts, business intelligence
- **Capabilities**: View all content, access statistics and audit logs, no actions

## Permission Implementation

### Decorator Usage

Permissions are enforced using the `@RequirePermission` decorator:

```typescript
@RequirePermission(PERMISSIONS.BAN_USERS)
async banUser(@Param('userId') userId: string) {
  // Only admins with ban_users permission can execute
}
```

### Guard Enforcement

The `AdminRoleGuard` enforces permissions by:
1. Extracting required permissions from decorators
2. Looking up admin role from database
3. Checking if admin has all required permissions
4. Attaching admin role to request context

### Database Storage

Permissions are stored as JSON array in `admin_roles.permissions`:
```json
["view_users", "ban_users", "unban_users", "view_artists"]
```

## Audit Workflow

### Automatic Logging

All admin actions are automatically logged to `admin_audit_logs` table with:

| Field | Description | Example |
|-------|-------------|---------|
| `adminId` | ID of admin performing action | `uuid-of-admin` |
| `action` | Action type identifier | `ban_user` |
| `entityType` | Type of entity affected | `user` |
| `entityId` | ID of affected entity | `uuid-of-banned-user` |
| `previousState` | JSON snapshot before action | `{ "banned": false }` |
| `newState` | JSON snapshot after action | `{ "banned": true }` |
| `reason` | Action reason (if provided) | "Spam activity" |
| `ipAddress` | Admin's IP address | `192.168.1.100` |
| `createdAt` | Timestamp of action | `2024-01-15T10:30:00Z` |

### Audit Trail by Action Type

#### User Management Actions

**Ban User**
- **Permission**: `ban_users`
- **Endpoint**: `PUT /api/admin/users/:userId/ban`
- **Audit Fields**:
  - `action`: `ban_user`
  - `entityType`: `user`
  - `previousState`: `{ banned: false, banReason: null }`
  - `newState`: `{ banned: true, banReason: "Spam activity" }`
- **Additional Context**: IP address, ban duration, reason

**Unban User**
- **Permission**: `unban_users`
- **Endpoint**: `PUT /api/admin/users/:userId/unban`
- **Audit Fields**:
  - `action`: `unban_user`
  - `entityType`: `user`
  - `previousState`: `{ banned: true, banReason: "Spam activity" }`
  - `newState`: `{ banned: false, banReason: null }`

#### Artist Management Actions

**Verify Artist**
- **Permission**: `verify_artists`
- **Endpoint**: `PUT /api/admin/artists/:artistId/verify`
- **Audit Fields**:
  - `action`: `verify_artist`
  - `entityType`: `artist`
  - `previousState`: `{ verified: false }`
  - `newState`: `{ verified: true, verifiedAt: "2024-01-15T10:30:00Z" }`

**Unverify Artist**
- **Permission**: `unverify_artists`
- **Endpoint**: `PUT /api/admin/artists/:artistId/unverify`
- **Audit Fields**:
  - `action`: `unverify_artist`
  - `entityType`: `artist`
  - `previousState**: `{ verified: true }`
  - `newState`: `{ verified: false }`

#### Content Management Actions

**Remove Track**
- **Permission**: `remove_tracks`
- **Endpoint**: `DELETE /api/admin/tracks/:trackId`
- **Audit Fields**:
  - `action`: `remove_track`
  - `entityType`: `track`
  - `previousState`: `{ deleted: false, title: "Song Title" }`
  - `newState`: `{ deleted: true, title: "Song Title" }`
- **Additional Context**: Removal reason

#### Report Management Actions

**Resolve Report**
- **Permission**: `resolve_reports`
- **Endpoint**: `PUT /api/admin/reports/:reportId/resolve`
- **Audit Fields**:
  - `action`: `resolve_report`
  - `entityType`: `report`
  - `previousState`: `{ status: "pending" }`
  - `newState`: `{ status: "resolved", resolution: "Valid report" }`

## Review and Oversight Workflow

### Daily Review Process

1. **Super Admin Review**
   - Review all actions from previous day
   - Focus on high-impact actions (bans, content removal)
   - Verify reasons and justification

2. **Cross-Role Validation**
   - Support actions reviewed by Moderators
   - Moderator actions reviewed by Super Admins
   - Analyst actions are read-only (no review needed)

### Weekly Reporting

**Metrics to Track**:
- Actions by role and permission
- Most active admins
- Common action reasons
- Peak activity times
- Escalation patterns

**Report Structure**:
```json
{
  "period": "2024-01-15 to 2024-01-21",
  "totalActions": 1250,
  "actionsByRole": {
    "super_admin": 150,
    "moderator": 800,
    "support": 250,
    "analyst": 50
  },
  "actionsByType": {
    "ban_user": 45,
    "verify_artist": 120,
    "remove_track": 15,
    "resolve_report": 200
  }
}
```

### Escalation Guidelines

**Immediate Escalation Required**:
- Mass actions (>100 entities in 1 hour)
- Actions on high-value accounts (verified artists, premium users)
- Unusual IP addresses or locations
- Actions outside business hours

**Review Within 24 Hours**:
- All ban/unban actions
- Content removal actions
- Artist verification/unverification
- Report resolutions with "valid" outcome

## Security Considerations

### Permission Validation

1. **Database-Level**: Permissions stored in JSON array for flexibility
2. **Application-Level**: Guard validates on every request
3. **Decorator-Level**: Explicit permission requirements
4. **Audit-Level**: All permission checks logged

### Access Control

1. **JWT Authentication**: Required for all admin endpoints
2. **Role Verification**: Admin role must exist and be active
3. **Permission Check**: All required permissions must be present
4. **IP Logging**: All actions tracked with IP addresses

### Data Protection

1. **PII Handling**: User data access logged and audited
2. **State Snapshots**: Before/after states captured for all actions
3. **Reason Tracking**: Mandatory reasons for destructive actions
4. **Retention**: Audit logs retained for minimum 1 year

## Common Permission Scenarios

### New Admin Onboarding

```typescript
// Create new moderator admin
const newAdmin = {
  userId: 'user-uuid',
  role: AdminRoleType.MODERATOR,
  permissions: ROLE_PERMISSIONS.moderator, // Auto-assigned
  grantedBy: 'super-admin-uuid'
};
```

### Permission Modification

```typescript
// Add specific permission to support role
const supportPermissions = [
  ...ROLE_PERMISSIONS.support,
  PERMISSIONS.VIEW_STATS // Add analytics access
];
```

### Temporary Access

```typescript
// Grant temporary elevated access
const tempPermissions = [
  ...ROLE_PERMISSIONS.support,
  PERMISSIONS.BAN_USERS // Temporary ban capability
];
```

## Troubleshooting

### Common Permission Issues

1. **Permission Not Working**
   - Check decorator syntax
   - Verify role assignment in database
   - Confirm permission string matches constants

2. **Audit Not Logging**
   - Verify admin service method calls audit logging
   - Check database connection for audit_logs table
   - Confirm IP address extraction

3. **Role Assignment Issues**
   - Verify admin role exists in database
   - Check permissions array format
   - Confirm grantedBy user exists

### Debug Commands

```sql
-- Check admin role permissions
SELECT role, permissions FROM admin_roles WHERE userId = 'user-uuid';

-- Check recent audit logs
SELECT * FROM admin_audit_logs WHERE adminId = 'admin-uuid' ORDER BY createdAt DESC LIMIT 10;

-- Verify permission constants
SELECT DISTINCT json_array_elements(permissions) as permission 
FROM admin_roles;
```

## API Reference

### Permission Check Endpoint

```typescript
// Internal use by AdminRoleGuard
async checkPermission(userId: string, permission: string): Promise<boolean> {
  const adminRole = await this.adminRoleRepository.findOne({ where: { userId } });
  return adminRole?.permissions.includes(permission) || false;
}
```

### Audit Log Query

```typescript
// Get audit logs for specific admin
async getAdminAuditLogs(adminId: string, limit: number = 100) {
  return this.auditLogRepository.find({
    where: { adminId },
    order: { createdAt: 'DESC' },
    take: limit
  });
}
```

## Compliance Notes

### GDPR Considerations

- All admin actions on EU user data are logged
- Audit logs include lawful basis for processing
- Right to access extends to admin action history
- Data retention policies apply to audit logs

### SOX Compliance

- Segregation of duties enforced through permissions
- All material changes have audit trail
- Review and approval workflows documented
- Access rights reviewed quarterly

### ISO 27001

- Access control policy implemented
- User access rights documented
- System activity monitoring enabled
- Incident response procedures defined

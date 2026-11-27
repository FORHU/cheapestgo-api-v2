-- migrate:up
-- What a role may do, read fresh on every request (#106).
--
-- Today every staff gate is `role === 'admin'` — one undifferentiated power, audited in #106:
-- banning a customer and refunding a Stripe charge are the same check. This table is the data
-- half of replacing that: a permission a route can name, and a mapping from role to permission
-- that a grant or revoke changes here, not in a deploy (#107 reads the same table for
-- `/auth/me`).
--
-- Seeded to match exactly what each role can already do — this migration changes the
-- mechanism, not anyone's access. `assign` stays admin-only per ADR-0041; `reply`/`resolve`
-- stay open to both, matching the lack of a reply-gate in `SupportService` today.
CREATE TABLE role_permissions (
    role       text NOT NULL,
    permission text NOT NULL,
    PRIMARY KEY (role, permission)
);

INSERT INTO role_permissions (role, permission) VALUES
    ('admin', 'dashboard.view'),
    ('admin', 'users.view'), ('admin', 'users.manage'),
    ('admin', 'bookings.view'), ('admin', 'bookings.cancel'), ('admin', 'bookings.modify'),
    ('admin', 'payments.view'), ('admin', 'payments.refund'), ('admin', 'payments.refund.approve'),
    ('admin', 'suppliers.view'), ('admin', 'suppliers.manage'),
    ('admin', 'support.conversations.view'), ('admin', 'support.conversations.assign'),
    ('admin', 'support.conversations.reply'), ('admin', 'support.conversations.resolve'),
    ('admin', 'staff.view'), ('admin', 'staff.invite'), ('admin', 'staff.manage'),
    ('admin', 'staff.permissions.manage'),
    ('admin', 'audit_logs.view'), ('admin', 'reports.view'),
    ('admin', 'system_settings.manage'),
    ('support_agent', 'support.conversations.view'),
    ('support_agent', 'support.conversations.reply'),
    ('support_agent', 'support.conversations.resolve');
    -- No `support.conversations.assign` for support_agent — ADR-0041, unchanged.

-- migrate:down
DROP TABLE role_permissions;

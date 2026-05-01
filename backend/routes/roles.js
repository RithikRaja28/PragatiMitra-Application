const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit"); // ← only addition to imports

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

const SUPER_ADMIN = ["super_admin"];

/* ── GET /api/roles ── list all roles ── */
router.get("/", verifyToken, requireRole(SUPER_ADMIN), async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(`
      SELECT id, name, display_name, description, permissions, is_system, created_at
      FROM roles
      ORDER BY display_name
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("GET /api/roles failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to fetch roles." });
  }
});

/* ── POST /api/roles ── create a custom role ── */
router.post("/", verifyToken, requireRole(SUPER_ADMIN), async (req, res) => {
  const pool = req.app.locals.pool;
  const { name, display_name, description = null, permissions = {} } = req.body;

  if (!name || !display_name) {
    return res.status(400).json({ success: false, message: "name and display_name are required." });
  }

  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    return res.status(400).json({ success: false, message: "name must be lowercase snake_case (e.g. dept_viewer)." });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO roles (name, display_name, description, permissions, is_system)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id, name, display_name, description, permissions, is_system, created_at`,
      [name, display_name, description, JSON.stringify(permissions)]
    );

    // ── Audit ──────────────────────────────────────────────────
    await writeAuditLog(req, {
      actionType: "ROLE_CREATED",
      entityType: "ROLE",
      entityId:   rows[0].id,
      newValue: {
        name:         rows[0].name,
        display_name: rows[0].display_name,
        description:  rows[0].description,
        permissions,
      },
      status:  "SUCCESS",
      message: `Role "${rows[0].display_name}" (${rows[0].name}) created`,
    });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: "A role with that name already exists." });
    }
    logger.error("POST /api/roles failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to create role." });
  }
});

/* ── PUT /api/roles/:id ── update display_name, description, permissions ── */
router.put("/:id", verifyToken, requireRole(SUPER_ADMIN), async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const { display_name, description, permissions } = req.body;

  if (!display_name && description === undefined && !permissions) {
    return res.status(400).json({ success: false, message: "Nothing to update." });
  }

  try {
    // ── Snapshot before update (for audit diff) ────────────────
    const { rows: existingRows } = await pool.query(
      "SELECT name, display_name, description, permissions FROM roles WHERE id = $1",
      [id]
    );
    if (existingRows.length === 0) {
      return res.status(404).json({ success: false, message: "Role not found." });
    }
    const existing = existingRows[0];

    // Build dynamic SET clause (your original logic unchanged)
    const fields = [];
    const values = [];
    let idx = 1;

    if (display_name)          { fields.push(`display_name = $${idx++}`); values.push(display_name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (permissions)           { fields.push(`permissions = $${idx++}`); values.push(JSON.stringify(permissions)); }

    values.push(id);

    const { rows } = await pool.query(
      `UPDATE roles SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, name, display_name, description, permissions, is_system, created_at`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Role not found." });
    }

    const updated = rows[0];

    // ── Audit: metadata changes ────────────────────────────────
    const metaChanged = ["display_name", "description"].filter(
      (f) => String(existing[f] ?? "") !== String(updated[f] ?? "")
    );
    if (metaChanged.length) {
      await writeAuditLog(req, {
        actionType:    "ROLE_UPDATED",
        entityType:    "ROLE",
        entityId:      updated.id,
        oldValue:      { display_name: existing.display_name, description: existing.description },
        newValue:      { display_name: updated.display_name,  description: updated.description  },
        changedFields: metaChanged,
        status:  "SUCCESS",
        message: `Role "${updated.display_name}" metadata updated`,
      });
    }

    // ── Audit: permission changes ──────────────────────────────
    if (permissions) {
      const oldPerms = existing.permissions  || {};
      const newPerms = permissions;
      const allKeys  = new Set([...Object.keys(oldPerms), ...Object.keys(newPerms)]);
      const permChanged = [...allKeys].filter((k) => Boolean(oldPerms[k]) !== Boolean(newPerms[k]));

      if (permChanged.length) {
        await writeAuditLog(req, {
          actionType:    "ROLE_PERMISSIONS_CHANGED",
          entityType:    "ROLE",
          entityId:      updated.id,
          oldValue:      Object.fromEntries(permChanged.map((k) => [k, oldPerms[k]])),
          newValue:      Object.fromEntries(permChanged.map((k) => [k, newPerms[k]])),
          changedFields: permChanged,
          status:  "SUCCESS",
          message: `Role "${updated.display_name}" permissions updated — ${permChanged.length} permission(s) changed`,
          metadata: {
            role_name: updated.name,
            granted:   permChanged.filter((k) => newPerms[k]),
            revoked:   permChanged.filter((k) => !newPerms[k]),
          },
        });
      }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    logger.error("PUT /api/roles/:id failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to update role." });
  }
});

/* ── DELETE /api/roles/:id ── only non-system roles ── */
router.delete("/:id", verifyToken, requireRole(SUPER_ADMIN), async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;

  try {
    const check = await pool.query(
      "SELECT id, name, display_name, description, permissions, is_system FROM roles WHERE id = $1",
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Role not found." });
    }
    if (check.rows[0].is_system) {
      return res.status(403).json({ success: false, message: "System roles cannot be deleted." });
    }

    await pool.query("DELETE FROM roles WHERE id = $1", [id]);

    // ── Audit ──────────────────────────────────────────────────
    await writeAuditLog(req, {
      actionType: "ROLE_DELETED",
      entityType: "ROLE",
      entityId:   check.rows[0].id,
      oldValue: {
        name:         check.rows[0].name,
        display_name: check.rows[0].display_name,
        description:  check.rows[0].description,
        permissions:  check.rows[0].permissions,
      },
      status:  "SUCCESS",
      message: `Role "${check.rows[0].display_name}" (${check.rows[0].name}) deleted`,
    });

    res.json({ success: true, message: "Role deleted." });
  } catch (err) {
    logger.error("DELETE /api/roles/:id failed", { ...getLogContext(req), stack: err.stack });
    res.status(500).json({ success: false, message: "Failed to delete role." });
  }
});

module.exports = router;
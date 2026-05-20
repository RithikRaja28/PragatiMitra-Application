"use strict";

const express = require("express");
const { verifyToken, requireRole } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");

const logger            = require("../utils/logger");
const { getLogContext } = logger;

const router = express.Router();

router.use(verifyToken);

/* ── Role helpers ── */
function isOnlyInstAdmin(req) {
  const roles = req.user.roles || [];
  return roles.includes("institute_admin") && !roles.includes("super_admin");
}

/* ── UUID validation helper ── */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => typeof v === "string" && UUID_RE.test(v);

/* ── GET /api/departments/institutions ──────────────────────────
   Super admin  → all active institutions (unchanged).
   Inst. admin  → only their own institution.
──────────────────────────────────────────────────────────────── */
router.get(
  "/institutions",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    try {
      if (isOnlyInstAdmin(req)) {
        const { rows } = await pool.query(
          `SELECT institution_id, institution_name
           FROM   institutions
           WHERE  institution_id = $1`,
          [req.user.institutionId]
        );
        return res.json({ success: true, data: rows });
      }

      // Super admin — original query unchanged
      const { rows } = await pool.query(
        `SELECT institution_id, institution_name
         FROM   institutions
         ORDER  BY institution_name ASC`
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error("GET /api/departments/institutions failed", {
        ...getLogContext(req), stack: err.stack,
      });
      return res.status(500).json({ success: false, message: "Failed to fetch institutions." });
    }
  }
);

/* ── GET /api/departments?institution_id=<uuid> ─────────────────
   Super admin  → any institution (unchanged).
   Inst. admin  → forced to their own institution_id.
──────────────────────────────────────────────────────────────── */
router.get(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    let { institution_id } = req.query;

    // Inst. admin: ignore whatever was sent, use their own
    if (isOnlyInstAdmin(req)) {
      institution_id = req.user.institutionId;
    }

    if (!isUUID(institution_id)) {
      return res.status(400).json({ success: false, message: "A valid institution_id is required." });
    }

    // For inst. admin: double-check it really is their institution
    if (isOnlyInstAdmin(req) && institution_id !== req.user.institutionId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    try {
      const { rows } = await pool.query(
        `SELECT
           d.department_id,
           d.name,
           d.code,
           d.status,
           d.created_at,
           COUNT(u.id) FILTER (WHERE u.account_status != 'DELETED') AS member_count
         FROM   departments d
         LEFT   JOIN users u
                ON  u.department_id  = d.department_id
                AND u.institution_id = $1
         WHERE  d.institution_id = $1
         GROUP  BY d.department_id, d.name, d.code, d.status, d.created_at
         ORDER  BY d.name ASC`,
        [institution_id]
      );
      return res.json({ success: true, data: rows });
    } catch (err) {
      logger.error("GET /api/departments failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to fetch departments." });
    }
  }
);

/* ── POST /api/departments ──────────────────────────────────────
   Super admin  → institution_id from request body (unchanged).
   Inst. admin  → institution_id forced to their own.
──────────────────────────────────────────────────────────────── */
router.post(
  "/",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const createdBy = req.user?.userId;

    const rawName = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const rawCode = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";

    // Inst. admin: ignore client-supplied institution_id, use their own
    const institution_id = isOnlyInstAdmin(req)
      ? req.user.institutionId
      : req.body.institution_id;

    const errors = {};
    if (!rawName) errors.name = "Department name is required.";
    else if (rawName.length > 120) errors.name = "Name must be 120 characters or fewer.";

    if (!rawCode) errors.code = "Department code is required.";
    else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";
    else if (!/^[A-Z0-9_-]+$/.test(rawCode))
      errors.code = "Code may only contain letters, digits, hyphens, and underscores.";

    if (!isUUID(institution_id)) errors.institution_id = "A valid institution is required.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, errors });
    }

    if (!isUUID(createdBy)) {
      return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
    }

    try {
      const { rows: instRows } = await pool.query(
        `SELECT 1 FROM institutions WHERE institution_id = $1 AND status = 'ACTIVE'`,
        [institution_id]
      );
      if (!instRows.length) {
        return res.status(400).json({
          success: false,
          errors: { institution_id: "Institution not found or is inactive." },
        });
      }

      const { rows: dupName } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1 AND LOWER(name) = LOWER($2)`,
        [institution_id, rawName]
      );
      if (dupName.length) {
        return res.status(409).json({
          success: false,
          errors: { name: `A department named "${rawName}" already exists in this institution.` },
        });
      }

      const { rows: dupCode } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1 AND code = $2`,
        [institution_id, rawCode]
      );
      if (dupCode.length) {
        return res.status(409).json({
          success: false,
          errors: { code: `Code "${rawCode}" is already used by another department in this institution.` },
        });
      }

      const { rows: [newDept] } = await pool.query(
        `INSERT INTO departments (institution_id, name, code, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)
         RETURNING department_id, name, code, status, created_at`,
        [institution_id, rawName, rawCode, createdBy]
      );

      await writeAuditLog(req, {
        actionType: "DEPT_CREATED",
        entityType: "DEPARTMENT",
        entityId:   newDept.department_id,
        newValue:   { name: newDept.name, code: newDept.code, status: newDept.status },
        status:     "SUCCESS",
        message:    `Department "${newDept.name}" created`,
      });

      return res.status(201).json({
        success: true,
        message: `Department "${newDept.name}" created successfully.`,
        data: newDept,
      });
    } catch (err) {
      logger.error("POST /api/departments failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to create department." });
    }
  }
);

/* ── PUT /api/departments/:id ───────────────────────────────────
   Super admin  → can update any department (unchanged).
   Inst. admin  → 403 if the department belongs to another institution.
──────────────────────────────────────────────────────────────── */
router.put(
  "/:id",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const updatedBy = req.user?.userId;
    const departmentId = req.params.id;

    if (!isUUID(departmentId)) {
      return res.status(400).json({ success: false, message: "Invalid department ID." });
    }
    if (!isUUID(updatedBy)) {
      return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
    }

    const rawName   = typeof req.body.name   === "string" ? req.body.name.trim()                : "";
    const rawCode   = typeof req.body.code   === "string" ? req.body.code.trim().toUpperCase()   : "";
    const rawStatus = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

    const errors = {};
    if (!rawName) errors.name = "Department name is required.";
    else if (rawName.length > 120) errors.name = "Name must be 120 characters or fewer.";

    if (!rawCode) errors.code = "Department code is required.";
    else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";
    else if (!/^[A-Z0-9_-]+$/.test(rawCode))
      errors.code = "Code may only contain letters, digits, hyphens, and underscores.";

    if (!["ACTIVE", "INACTIVE"].includes(rawStatus))
      errors.status = "Status must be ACTIVE or INACTIVE.";

    if (Object.keys(errors).length) {
      return res.status(400).json({ success: false, errors });
    }

    try {
      const { rows: existingRows } = await pool.query(
        `SELECT department_id, name, code, status, institution_id
         FROM   departments
         WHERE  department_id = $1`,
        [departmentId]
      );
      if (!existingRows.length) {
        return res.status(404).json({ success: false, message: "Department not found." });
      }
      const existing = existingRows[0];

      // Inst. admin: must own this department
      if (isOnlyInstAdmin(req) && existing.institution_id !== req.user.institutionId) {
        return res.status(403).json({ success: false, message: "You can only manage departments in your own institution." });
      }

      const { rows: dupName } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1
           AND  LOWER(name) = LOWER($2)
           AND  department_id <> $3`,
        [existing.institution_id, rawName, departmentId]
      );
      if (dupName.length) {
        return res.status(409).json({
          success: false,
          errors: { name: `A department named "${rawName}" already exists in this institution.` },
        });
      }

      const { rows: dupCode } = await pool.query(
        `SELECT 1 FROM departments
         WHERE  institution_id = $1
           AND  code = $2
           AND  department_id <> $3`,
        [existing.institution_id, rawCode, departmentId]
      );
      if (dupCode.length) {
        return res.status(409).json({
          success: false,
          errors: { code: `Code "${rawCode}" is already used by another department in this institution.` },
        });
      }

      if (existing.status === "ACTIVE" && rawStatus === "INACTIVE") {
        const { rows: [{ active_count }] } = await pool.query(
          `SELECT COUNT(*) AS active_count
           FROM   users
           WHERE  department_id  = $1
             AND  account_status = 'ACTIVE'`,
          [departmentId]
        );
        if (Number(active_count) > 0) {
          return res.status(409).json({
            success: false,
            message: `Cannot deactivate "${existing.name}": ${active_count} user(s) are still active. Deactivate all members first.`,
          });
        }
      }

      const { rows: [updated] } = await pool.query(
        `UPDATE departments
         SET    name       = $2,
                code       = $3,
                status     = $4,
                updated_at = now(),
                updated_by = $5
         WHERE  department_id = $1
         RETURNING department_id, name, code, status, created_at, updated_at`,
        [departmentId, rawName, rawCode, rawStatus, updatedBy]
      );

      const changedFields = ["name", "code", "status"].filter(
        (f) => existing[f] !== updated[f]
      );

      await writeAuditLog(req, {
        actionType:    "DEPT_UPDATED",
        entityType:    "DEPARTMENT",
        entityId:      updated.department_id,
        oldValue:      { name: existing.name, code: existing.code, status: existing.status },
        newValue:      { name: updated.name,  code: updated.code,  status: updated.status  },
        changedFields,
        status:        "SUCCESS",
        message:       `Department "${updated.name}" updated`,
      });

      return res.json({
        success: true,
        message: `Department "${updated.name}" updated successfully.`,
        data: updated,
      });
    } catch (err) {
      logger.error("PUT /api/departments/:id failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to update department." });
    }
  }
);

/* ── PATCH /api/departments/:id/deactivate ──────────────────────
   Super admin  → institution_id from request body (unchanged).
   Inst. admin  → institution_id forced to their own.
──────────────────────────────────────────────────────────────── */
router.patch(
  "/:id/deactivate",
  requireRole(["super_admin", "institute_admin"]),
  async (req, res) => {
    const pool = req.app.locals.pool;
    const updatedBy = req.user?.userId;
    const departmentId = req.params.id;

    // Inst. admin: use their own institution_id regardless of request body
    const institution_id = isOnlyInstAdmin(req)
      ? req.user.institutionId
      : req.body.institution_id;

    if (!isUUID(departmentId)) {
      return res.status(400).json({ success: false, message: "Invalid department ID." });
    }
    if (!isUUID(institution_id)) {
      return res.status(400).json({ success: false, message: "A valid institution_id is required." });
    }

    try {
      const { rows: deptRows } = await pool.query(
        `SELECT department_id, name, status
         FROM   departments
         WHERE  department_id = $1 AND institution_id = $2`,
        [departmentId, institution_id]
      );

      if (!deptRows.length) {
        return res.status(404).json({ success: false, message: "Department not found." });
      }

      const dept = deptRows[0];

      if (dept.status === "INACTIVE") {
        return res.status(409).json({ success: false, message: "Department is already inactive." });
      }

      const { rows: [{ active_count }] } = await pool.query(
        `SELECT COUNT(*) AS active_count
         FROM   users
         WHERE  department_id  = $1
           AND  institution_id = $2
           AND  account_status = 'ACTIVE'`,
        [departmentId, institution_id]
      );

      if (Number(active_count) > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot deactivate "${dept.name}": ${active_count} user(s) are still active. Deactivate all members first.`,
        });
      }

      await pool.query(
        `UPDATE departments
         SET    status     = 'INACTIVE',
                updated_at = now(),
                updated_by = $2
         WHERE  department_id = $1`,
        [departmentId, updatedBy]
      );

      await writeAuditLog(req, {
        actionType:    "DEPT_DEACTIVATED",
        entityType:    "DEPARTMENT",
        entityId:      departmentId,
        oldValue:      { status: "ACTIVE" },
        newValue:      { status: "INACTIVE" },
        changedFields: ["status"],
        status:        "SUCCESS",
        message:       `Department "${dept.name}" deactivated`,
      });

      return res.json({ success: true, message: `"${dept.name}" has been deactivated.` });
    } catch (err) {
      logger.error("PATCH /api/departments/:id/status failed", { ...getLogContext(req), stack: err.stack });
      return res.status(500).json({ success: false, message: "Failed to deactivate department." });
    }
  }
);

module.exports = router;

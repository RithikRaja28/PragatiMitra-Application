"use strict";

/**
 * routes/committees.js
 * ─────────────────────────────────────────────────────────────
 * Full CRUD for management_committees table.
 *
 * Mount in server.js:
 *   app.use("/api/committees", require("./routes/committees"));
 *
 * Endpoints:
 *   GET    /api/committees/meta
 *   GET    /api/committees?institute_id=&finance_year=&committee_type=&status=&search=
 *   POST   /api/committees
 *   PUT    /api/committees/:id
 *   PATCH  /api/committees/:id/status
 *   DELETE /api/committees/:id
 *
 * FIX (audit logs not appearing):
 *   ✅ Removed internal writeAuditLog — was silently failing due to
 *      changedFields type mismatch (JSON.stringify vs raw array)
 *   ✅ Now uses shared utils/audit.js writeAuditLog consistently
 *   ✅ All calls pass entityType: "COMMITTEE" explicitly
 *   ✅ changedFields passed as raw JS array (not JSON.stringify)
 * ─────────────────────────────────────────────────────────────
 */

const express              = require("express");
const { verifyToken }      = require("../middleware/auth");
const logger               = require("../utils/logger");
const { getLogContext }    = logger;

// ── FIX: Use the shared audit utility instead of the internal one ──────────
const { writeAuditLog }    = require("../utils/audit");

const router = express.Router();
router.use(verifyToken);

/* ── Enum values ─────────────────────────────────────────────── */
const COMMITTEE_TYPES = [
  { value: "GB",     label: "Governing Body (GB)" },
  { value: "EC",     label: "Executive Council (EC)" },
  { value: "SFC",    label: "Standing Finance Committee (SFC)" },
  { value: "ASAC",   label: "Academic & Scientific Advisory Committee (ASAC)" },
  { value: "OTHERS", label: "Others" },
];

const POSITIONS = [
  { value: "CHAIRPERSON",      label: "Chairperson" },
  { value: "MEMBER_SECRETARY", label: "Member Secretary" },
  { value: "SECRETARY",        label: "Secretary" },
  { value: "MEMBER",           label: "Member" },
  { value: "VICE_PRESIDENT",   label: "Vice President" },
  { value: "PRESIDENT",        label: "President" },
];

const COMMITTEE_TYPE_VALUES = COMMITTEE_TYPES.map((t) => t.value);
const POSITION_VALUES       = POSITIONS.map((p) => p.value);
const FINANCE_YEAR_RE       = /^\d{4}-\d{4}$/;

/* ── Helpers ─────────────────────────────────────────────────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidInstituteId(v) {
  if (!v) return false;
  const n = Number(v);
  if (Number.isInteger(n) && n > 0) return true;
  if (UUID_RE.test(String(v))) return true;
  return false;
}

function validateFinanceYear(fy) {
  if (!fy || !FINANCE_YEAR_RE.test(fy)) return false;
  const [start, end] = fy.split("-").map(Number);
  return end === start + 1;
}

function generateFinanceYears() {
  const cur   = new Date().getFullYear();
  const years = [];
  for (let y = cur + 1; y >= cur - 4; y--) {
    years.push(`${y}-${y + 1}`);
  }
  return years;
}

function validateMembers(raw) {
  if (!Array.isArray(raw))  return { ok: false, error: "members must be a JSON array." };
  if (raw.length === 0)     return { ok: false, error: "At least one member is required." };
  const sanitised = [];
  for (let i = 0; i < raw.length; i++) {
    const m           = raw[i];
    if (typeof m !== "object" || m === null)
      return { ok: false, error: `members[${i}] must be an object.` };
    const name        = typeof m.name        === "string" ? m.name.trim()        : "";
    const designation = typeof m.designation === "string" ? m.designation.trim() : "";
    if (!name)        return { ok: false, error: `members[${i}].name is required.` };
    if (!designation) return { ok: false, error: `members[${i}].designation is required.` };
    sanitised.push({ name, designation });
  }
  return { ok: true, sanitised };
}

/* ─────────────────────────────────────────────────────────────
   changedFieldsBetween — compare two flat/shallow objects and
   return the list of keys whose values differ.
───────────────────────────────────────────────────────────── */
function changedFieldsBetween(oldObj, newObj) {
  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const diff = [];
  for (const k of keys) {
    const ov = JSON.stringify(oldObj[k] ?? null);
    const nv = JSON.stringify(newObj[k] ?? null);
    if (ov !== nv) diff.push(k);
  }
  return diff;
}

/* ═══════════════════════════════════════════════════════════════
   GET /api/committees/meta
═══════════════════════════════════════════════════════════════ */
router.get("/meta", (_req, res) => {
  return res.json({
    success: true,
    data: {
      committeeTypes: COMMITTEE_TYPES,
      positions:      POSITIONS,
      financeYears:   generateFinanceYears(),
    },
  });
});

/* ═══════════════════════════════════════════════════════════════
   GET /api/committees
═══════════════════════════════════════════════════════════════ */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const { institute_id, finance_year, committee_type, status = "ALL", search } = req.query;

  if (!isValidInstituteId(institute_id)) {
    return res.status(400).json({ success: false, message: "A valid institute_id is required." });
  }

  try {
    const conditions = ["mc.institute_id = $1"];
    const params     = [institute_id];
    let   idx        = 2;

    if (finance_year) {
      conditions.push(`mc.finance_year = $${idx++}`);
      params.push(finance_year);
    }
    if (committee_type && COMMITTEE_TYPE_VALUES.includes(committee_type)) {
      conditions.push(`mc.committee_type = $${idx++}`);
      params.push(committee_type);
    }
    if (status !== "ALL" && ["ACTIVE", "INACTIVE"].includes(status)) {
      conditions.push(`mc.status = $${idx++}`);
      params.push(status);
    }
    if (search && search.trim()) {
      conditions.push(
        `(mc.committee_type::text ILIKE $${idx} OR mc.members::text ILIKE $${idx} OR mc.contact ILIKE $${idx})`
      );
      params.push(`%${search.trim()}%`);
      idx++;
    }

    const { rows } = await pool.query(
      `SELECT
         mc.id,
         mc.institute_id,
         mc.finance_year,
         mc.committee_type,
         mc.members,
         mc.position,
         mc.contact,
         mc.status,
         mc.created_at,
         mc.updated_at,
         jsonb_array_length(mc.members) AS member_count
       FROM   management_committees mc
       WHERE  ${conditions.join(" AND ")}
       ORDER  BY mc.finance_year DESC, mc.committee_type ASC, mc.id ASC`,
      params
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    logger.error("GET /api/committees failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to fetch committees." });
  }
});

/* ═══════════════════════════════════════════════════════════════
   POST /api/committees
═══════════════════════════════════════════════════════════════ */
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const { institute_id, finance_year, committee_type, members: rawMembers, position, contact } = req.body;

  const errors = {};
  if (!isValidInstituteId(institute_id))               errors.institute_id   = "A valid institute is required.";
  if (!validateFinanceYear(finance_year))              errors.finance_year   = "Finance year must be YYYY-YYYY (consecutive years).";
  if (!COMMITTEE_TYPE_VALUES.includes(committee_type)) errors.committee_type = "Invalid committee type.";
  if (!POSITION_VALUES.includes(position))             errors.position       = "Invalid position.";
  if (contact && contact.length > 100)                 errors.contact        = "Contact must be 100 characters or fewer.";

  const membersResult = validateMembers(rawMembers);
  if (!membersResult.ok) errors.members = membersResult.error;

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    /* Duplicate guard */
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM management_committees
       WHERE  institute_id   = $1
         AND  finance_year   = $2
         AND  committee_type = $3
         AND  position       = $4
         AND  status        != 'INACTIVE'`,
      [institute_id, finance_year, committee_type, position]
    );
    if (dup.length) {
      const typeLabel = COMMITTEE_TYPES.find((t) => t.value === committee_type)?.label ?? committee_type;
      return res.status(409).json({
        success: false,
        errors: {
          committee_type: `A "${typeLabel}" entry with position "${position}" already exists for ${finance_year}.`,
        },
      });
    }

    const { rows: [created] } = await pool.query(
      `INSERT INTO management_committees
         (institute_id, finance_year, committee_type, members, position, contact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [institute_id, finance_year, committee_type, JSON.stringify(membersResult.sanitised), position, contact?.trim() || null]
    );

    const typeLabel = COMMITTEE_TYPES.find((t) => t.value === committee_type)?.label ?? committee_type;

    // ── FIX: Use shared writeAuditLog from utils/audit.js ─────────────────
    await writeAuditLog(req, {
      actionType:    "COMMITTEE_CREATED",
      entityType:    "COMMITTEE",              // ← explicit, matches audit_logs column
      entityId:      String(created.id),
      status:        "SUCCESS",
      message:       `Committee "${typeLabel}" created for ${finance_year}.`,
      newValue: {
        institute_id:   created.institute_id,
        finance_year:   created.finance_year,
        committee_type: created.committee_type,
        position:       created.position,
        contact:        created.contact,
        members:        created.members,
        status:         created.status,
      },
    });

    return res.status(201).json({
      success: true,
      message: `Committee "${typeLabel}" created successfully.`,
      data:    created,
    });
  } catch (err) {
    logger.error("POST /api/committees failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to create committee.", detail: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════
   PUT /api/committees/:id
═══════════════════════════════════════════════════════════════ */
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const id   = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid committee ID." });
  }

  const { finance_year, committee_type, members: rawMembers, position, contact } = req.body;

  const errors = {};
  if (!validateFinanceYear(finance_year))              errors.finance_year   = "Finance year must be YYYY-YYYY (consecutive years).";
  if (!COMMITTEE_TYPE_VALUES.includes(committee_type)) errors.committee_type = "Invalid committee type.";
  if (!POSITION_VALUES.includes(position))             errors.position       = "Invalid position.";
  if (contact && contact.length > 100)                 errors.contact        = "Contact must be 100 characters or fewer.";

  const membersResult = validateMembers(rawMembers);
  if (!membersResult.ok) errors.members = membersResult.error;

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM management_committees WHERE id = $1`, [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Committee not found." });
    }
    const row = existing[0];

    /* Duplicate guard (exclude self) */
    const { rows: dup } = await pool.query(
      `SELECT 1 FROM management_committees
       WHERE  institute_id   = $1
         AND  finance_year   = $2
         AND  committee_type = $3
         AND  position       = $4
         AND  status        != 'INACTIVE'
         AND  id            != $5`,
      [row.institute_id, finance_year, committee_type, position, id]
    );
    if (dup.length) {
      const typeLabel = COMMITTEE_TYPES.find((t) => t.value === committee_type)?.label ?? committee_type;
      return res.status(409).json({
        success: false,
        errors: {
          committee_type: `A "${typeLabel}" entry with position "${position}" already exists for ${finance_year}.`,
        },
      });
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE management_committees
       SET  finance_year   = $2,
            committee_type = $3,
            members        = $4,
            position       = $5,
            contact        = $6,
            updated_at     = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, finance_year, committee_type, JSON.stringify(membersResult.sanitised), position, contact?.trim() || null]
    );

    const oldSnapshot = {
      finance_year:   row.finance_year,
      committee_type: row.committee_type,
      position:       row.position,
      contact:        row.contact ?? null,
      members:        row.members,
    };
    const newSnapshot = {
      finance_year:   updated.finance_year,
      committee_type: updated.committee_type,
      position:       updated.position,
      contact:        updated.contact ?? null,
      members:        updated.members,
    };

    // ── FIX: changedFields passed as raw array (not JSON.stringify) ────────
    const changed = changedFieldsBetween(oldSnapshot, newSnapshot);

    const typeLabel = COMMITTEE_TYPES.find((t) => t.value === updated.committee_type)?.label ?? committee_type;

    // ── FIX: Use shared writeAuditLog from utils/audit.js ─────────────────
    await writeAuditLog(req, {
      actionType:    "COMMITTEE_UPDATED",
      entityType:    "COMMITTEE",
      entityId:      String(id),
      status:        "SUCCESS",
      message:       `Committee "${typeLabel}" (${updated.finance_year}) updated.`,
      oldValue:      oldSnapshot,
      newValue:      newSnapshot,
      changedFields: changed,     // ← raw JS array, utils/audit.js handles it correctly
    });

    return res.json({ success: true, message: "Committee updated successfully.", data: updated });
  } catch (err) {
    logger.error("PUT /api/committees/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update committee." });
  }
});

/* ═══════════════════════════════════════════════════════════════
   PATCH /api/committees/:id/status
═══════════════════════════════════════════════════════════════ */
router.patch("/:id/status", async (req, res) => {
  const pool       = req.app.locals.pool;
  const id         = Number(req.params.id);
  const { status } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid committee ID." });
  }
  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be ACTIVE or INACTIVE." });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT id, committee_type, finance_year, status FROM management_committees WHERE id = $1`, [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Committee not found." });
    }
    if (existing[0].status === status) {
      return res.status(409).json({ success: false, message: `Committee is already ${status.toLowerCase()}.` });
    }

    const prevStatus  = existing[0].status;
    const financeYear = existing[0].finance_year;

    await pool.query(
      `UPDATE management_committees SET status = $2, updated_at = NOW() WHERE id = $1`,
      [id, status]
    );

    const label      = COMMITTEE_TYPES.find((t) => t.value === existing[0].committee_type)?.label
                       ?? existing[0].committee_type.replace(/_/g, " ");
    const actionType = status === "ACTIVE" ? "COMMITTEE_ACTIVATED" : "COMMITTEE_DEACTIVATED";
    const verb       = status === "ACTIVE" ? "activated" : "deactivated";

    // ── FIX: Use shared writeAuditLog from utils/audit.js ─────────────────
    await writeAuditLog(req, {
      actionType,
      entityType:    "COMMITTEE",
      entityId:      String(id),
      status:        "SUCCESS",
      message:       `"${label}" (${financeYear}) ${verb}.`,
      oldValue:      { status: prevStatus },
      newValue:      { status },
      changedFields: ["status"],   // ← raw array, correct for utils/audit.js
    });

    return res.json({
      success: true,
      message: `"${label}" has been ${verb}.`,
    });
  } catch (err) {
    logger.error("PATCH /api/committees/:id/status failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to update committee status." });
  }
});

/* ═══════════════════════════════════════════════════════════════
   DELETE /api/committees/:id
═══════════════════════════════════════════════════════════════ */
router.delete("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const id   = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: "Invalid committee ID." });
  }

  try {
    const { rows: existing } = await pool.query(
      `SELECT * FROM management_committees WHERE id = $1`, [id]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Committee not found." });
    }
    const row = existing[0];

    await pool.query(`DELETE FROM management_committees WHERE id = $1`, [id]);

    const label = COMMITTEE_TYPES.find((t) => t.value === row.committee_type)?.label
                  ?? row.committee_type.replace(/_/g, " ");

    // ── FIX: Use shared writeAuditLog from utils/audit.js ─────────────────
    await writeAuditLog(req, {
      actionType: "COMMITTEE_DELETED",
      entityType: "COMMITTEE",
      entityId:   String(id),
      status:     "SUCCESS",
      message:    `Committee "${label}" (${row.finance_year}) deleted.`,
      oldValue: {
        institute_id:   row.institute_id,
        finance_year:   row.finance_year,
        committee_type: row.committee_type,
        position:       row.position,
        contact:        row.contact ?? null,
        members:        row.members,
        status:         row.status,
      },
    });

    return res.json({ success: true, message: `"${label}" has been deleted.` });
  } catch (err) {
    logger.error("DELETE /api/committees/:id failed", { ...getLogContext(req), stack: err.stack });
    return res.status(500).json({ success: false, message: "Failed to delete committee." });
  }
});

module.exports = router;
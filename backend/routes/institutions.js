"use strict";

const express = require("express");
const { verifyToken } = require("../middleware/auth");
const { writeAuditLog } = require("../utils/audit");

const router = express.Router();

router.use(verifyToken);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => typeof v === "string" && UUID_RE.test(v);

/* ── GET /api/institutions ── */
router.get("/", async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const { rows } = await pool.query(
      `SELECT
         i.institution_id,
         i.institution_name,
         i.code,
         i.email_domain,
         i.address_line1,
         i.address_line2,
         i.city,
         i.state,
         i.country,
         i.pincode,
         i.status,
         i.created_at,
         (
           SELECT COUNT(*)
           FROM departments d
           WHERE d.institution_id = i.institution_id
             AND d.status = 'ACTIVE'
         ) AS department_count,
         (
           SELECT COUNT(*)
           FROM users u
           WHERE u.institution_id = i.institution_id
             AND u.account_status = 'ACTIVE'
         ) AS user_count
       FROM institutions i
       ORDER BY i.institution_name ASC`
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[INST] list:", err.message);
    return res.status(500).json({ success: false, message: "Failed to fetch institutions." });
  }
});

/* ── POST /api/institutions ── */
router.post("/", async (req, res) => {
  const pool = req.app.locals.pool;
  const createdBy = req.user?.userId;

  if (!isUUID(createdBy)) {
    return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
  }

  const rawName    = typeof req.body.institution_name === "string" ? req.body.institution_name.trim() : "";
  const rawCode    = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const rawDomain  = typeof req.body.email_domain === "string" ? req.body.email_domain.trim().toLowerCase() : "";
  const rawAddr1   = typeof req.body.address_line1 === "string" ? req.body.address_line1.trim() : "";
  const rawAddr2   = typeof req.body.address_line2 === "string" ? req.body.address_line2.trim() : "";
  const rawCity    = typeof req.body.city === "string" ? req.body.city.trim() : "";
  const rawState   = typeof req.body.state === "string" ? req.body.state.trim() : "";
  const rawCountry = typeof req.body.country === "string" ? req.body.country.trim() : "India";
  const rawPincode = typeof req.body.pincode === "string" ? req.body.pincode.trim() : "";

  const errors = {};
  if (!rawName)   errors.institution_name = "Institution name is required.";
  else if (rawName.length > 200) errors.institution_name = "Name must be 200 characters or fewer.";

  if (!rawCode)   errors.code = "Institution code is required.";
  else if (!/^[A-Z0-9_-]+$/.test(rawCode)) errors.code = "Only letters, digits, hyphens, underscores allowed.";
  else if (rawCode.length > 20) errors.code = "Code must be 20 characters or fewer.";

  if (!rawDomain) errors.email_domain = "Email domain is required.";
  else if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(rawDomain)) errors.email_domain = "Enter a valid domain (e.g. college.edu.in).";

  if (!rawAddr1)   errors.address_line1 = "Address line 1 is required.";
  if (!rawCity)    errors.city = "City is required.";
  if (!rawState)   errors.state = "State is required.";
  if (!rawPincode) errors.pincode = "Pincode is required.";
  else if (!/^\d{6}$/.test(rawPincode)) errors.pincode = "Pincode must be 6 digits.";

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const { rows: dupCode } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(code) = LOWER($1)`,
      [rawCode]
    );
    if (dupCode.length) {
      return res.status(409).json({
        success: false,
        errors: { code: `Institution code "${rawCode}" already exists.` },
      });
    }

    const { rows: dupDomain } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(email_domain) = LOWER($1)`,
      [rawDomain]
    );
    if (dupDomain.length) {
      return res.status(409).json({
        success: false,
        errors: { email_domain: `Domain "${rawDomain}" is already registered to another institution.` },
      });
    }

    const { rows: [newInst] } = await pool.query(
      `INSERT INTO institutions
         (institution_name, code, email_domain, address_line1, address_line2,
          city, state, country, pincode, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       RETURNING institution_id, institution_name, code, email_domain,
                 address_line1, city, state, pincode, status, created_at`,
      [rawName, rawCode, rawDomain, rawAddr1, rawAddr2 || null,
       rawCity, rawState, rawCountry, rawPincode, createdBy]
    );

    // ── Audit log ──
    await writeAuditLog(req, {
      actionType: "INST_CREATED",
      entityType: "INSTITUTION",
      entityId:   newInst.institution_id,
      newValue: {
        name:         newInst.institution_name,
        code:         newInst.code,
        email_domain: newInst.email_domain,
        city:         newInst.city,
        state:        newInst.state,
        pincode:      newInst.pincode,
        status:       newInst.status,
      },
      status:  "SUCCESS",
      message: `Institution "${newInst.institution_name}" created`,
    });

    return res.status(201).json({
      success: true,
      message: `Institution "${newInst.institution_name}" created successfully.`,
      data: newInst,
    });
  } catch (err) {
    console.error("[INST] create:", err.message);
    return res.status(500).json({ success: false, message: "Failed to create institution." });
  }
});

/* ── PUT /api/institutions/:id ── */
router.put("/:id", async (req, res) => {
  const pool = req.app.locals.pool;
  const updatedBy = req.user?.userId;
  const institutionId = req.params.id;

  if (!isUUID(institutionId)) {
    return res.status(400).json({ success: false, message: "Invalid institution ID." });
  }
  if (!isUUID(updatedBy)) {
    return res.status(401).json({ success: false, message: "Session is invalid. Please sign in again." });
  }

  const rawName    = typeof req.body.institution_name === "string" ? req.body.institution_name.trim() : "";
  const rawCode    = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const rawDomain  = typeof req.body.email_domain === "string" ? req.body.email_domain.trim().toLowerCase() : "";
  const rawAddr1   = typeof req.body.address_line1 === "string" ? req.body.address_line1.trim() : "";
  const rawAddr2   = typeof req.body.address_line2 === "string" ? req.body.address_line2.trim() : "";
  const rawCity    = typeof req.body.city === "string" ? req.body.city.trim() : "";
  const rawState   = typeof req.body.state === "string" ? req.body.state.trim() : "";
  const rawCountry = typeof req.body.country === "string" ? req.body.country.trim() : "India";
  const rawPincode = typeof req.body.pincode === "string" ? req.body.pincode.trim() : "";
  const rawStatus  = typeof req.body.status === "string" ? req.body.status.trim().toUpperCase() : "";

  const errors = {};
  if (!rawName)   errors.institution_name = "Institution name is required.";
  if (!rawCode)   errors.code = "Code is required.";
  else if (!/^[A-Z0-9_-]+$/.test(rawCode)) errors.code = "Only letters, digits, hyphens, underscores allowed.";
  if (!rawDomain) errors.email_domain = "Email domain is required.";
  if (!rawAddr1)  errors.address_line1 = "Address line 1 is required.";
  if (!rawCity)   errors.city = "City is required.";
  if (!rawState)  errors.state = "State is required.";
  if (!rawPincode) errors.pincode = "Pincode is required.";
  else if (!/^\d{6}$/.test(rawPincode)) errors.pincode = "Pincode must be 6 digits.";
  if (!["ACTIVE", "INACTIVE"].includes(rawStatus)) errors.status = "Status must be ACTIVE or INACTIVE.";

  if (Object.keys(errors).length) {
    return res.status(400).json({ success: false, errors });
  }

  try {
    const { rows: existingRows } = await pool.query(
      `SELECT institution_id, institution_name, code, email_domain,
              city, state, pincode, status
       FROM institutions WHERE institution_id = $1`,
      [institutionId]
    );
    if (!existingRows.length) {
      return res.status(404).json({ success: false, message: "Institution not found." });
    }
    const existing = existingRows[0];

    const { rows: dupCode } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(code) = LOWER($1) AND institution_id <> $2`,
      [rawCode, institutionId]
    );
    if (dupCode.length) {
      return res.status(409).json({
        success: false,
        errors: { code: `Institution code "${rawCode}" already exists.` },
      });
    }

    const { rows: dupDomain } = await pool.query(
      `SELECT 1 FROM institutions WHERE LOWER(email_domain) = LOWER($1) AND institution_id <> $2`,
      [rawDomain, institutionId]
    );
    if (dupDomain.length) {
      return res.status(409).json({
        success: false,
        errors: { email_domain: `Domain "${rawDomain}" is already registered to another institution.` },
      });
    }

    if (existing.status === "ACTIVE" && rawStatus === "INACTIVE") {
      const { rows: [{ active_count }] } = await pool.query(
        `SELECT COUNT(*) AS active_count FROM users
         WHERE institution_id = $1 AND account_status = 'ACTIVE'`,
        [institutionId]
      );
      if (Number(active_count) > 0) {
        return res.status(409).json({
          success: false,
          message: `Cannot deactivate: ${active_count} active user(s) still belong to this institution.`,
        });
      }
    }

    const { rows: [updated] } = await pool.query(
      `UPDATE institutions
       SET institution_name = $1, code = $2, email_domain = $3,
           address_line1 = $4, address_line2 = $5, city = $6,
           state = $7, country = $8, pincode = $9, status = $10,
           updated_at = now(), updated_by = $11
       WHERE institution_id = $12
       RETURNING institution_id, institution_name, code, email_domain,
                 city, state, pincode, status, updated_at`,
      [rawName, rawCode, rawDomain, rawAddr1, rawAddr2 || null,
       rawCity, rawState, rawCountry, rawPincode, rawStatus, updatedBy, institutionId]
    );

    // ── Audit log — only record fields that actually changed ──
    const changedFields = [
      "institution_name", "code", "email_domain",
      "city", "state", "pincode", "status",
    ].filter((f) => String(existing[f] ?? "") !== String(updated[f] ?? ""));

    await writeAuditLog(req, {
      actionType: "INST_UPDATED",
      entityType: "INSTITUTION",
      entityId:   updated.institution_id,
      oldValue: {
        name:         existing.institution_name,
        code:         existing.code,
        email_domain: existing.email_domain,
        city:         existing.city,
        state:        existing.state,
        pincode:      existing.pincode,
        status:       existing.status,
      },
      newValue: {
        name:         updated.institution_name,
        code:         updated.code,
        email_domain: updated.email_domain,
        city:         updated.city,
        state:        updated.state,
        pincode:      updated.pincode,
        status:       updated.status,
      },
      changedFields,
      status:  "SUCCESS",
      message: `Institution "${updated.institution_name}" updated`,
    });

    return res.json({
      success: true,
      message: `Institution "${updated.institution_name}" updated successfully.`,
      data: updated,
    });
  } catch (err) {
    console.error("[INST] update:", err.message);
    return res.status(500).json({ success: false, message: "Failed to update institution." });
  }
});

module.exports = router;
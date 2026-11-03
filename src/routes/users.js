'use strict';

/**
 * AirdropNexus AI — Users route (single owner placeholder).
 */

const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const { getDb } = require('../database/db');

router.get('/me', (req, res) => {
  res.json({ id: 1, email: 'owner@airdropnexus.local', role: 'owner' });
});

module.exports = router;

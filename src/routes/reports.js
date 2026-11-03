'use strict';

/**
 * AirdropNexus AI — Daily Reports routes.
 */

const express = require('express');
const router = express.Router();
const config = require('../config/env');
const logger = require('../config/logger');
const { getDb, all, get, run } = require('../database/db');

router.get('/', (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(parseInt(page, 10), 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10), 1), 100);
  const offset = (pageNum - 1) * limitNum;

  const rows = all(
    `SELECT * FROM daily_reports ORDER BY report_date DESC LIMIT ? OFFSET ?`,
    [limitNum, offset]
  );

  res.json({ reports: rows, page: pageNum, limit: limitNum });
});

router.get('/:date', (req, res) => {
  const { date } = req.params;
  const report = get('SELECT * FROM daily_reports WHERE report_date = ?', [date]);
  if (!report) return res.status(404).json({ error: 'No report for this date' });
  res.json(report);
});

router.post('/generate', (req, res) => {
  const { date } = req.body || {};
  const reportDate = date || new Date().toISOString().slice(0, 10);

  const postsScanned = (get('SELECT COUNT(*) AS c FROM x_posts WHERE date(ingested_at) = ?', [reportDate]) || {}).c || 0;
  const postsProcessed = (get('SELECT COUNT(*) AS c FROM campaigns WHERE date(created_at) = ?', [reportDate]) || {}).c || 0;
  const newCampaigns = (get("SELECT COUNT(*) AS c FROM campaigns WHERE date(created_at) = ? AND status = 'New'", [reportDate]) || {}).c || 0;
  const relevant = (get("SELECT COUNT(*) AS c FROM campaigns WHERE date(created_at) = ? AND status = 'Relevant'", [reportDate]) || {}).c || 0;
  const suspicious = (get("SELECT COUNT(*) AS c FROM campaigns WHERE date(created_at) = ? AND status = 'Scam/Suspicious'", [reportDate]) || {}).c || 0;
  const failedJobs = (get("SELECT COUNT(*) AS c FROM job_runs WHERE date(created_at) = ? AND status = 'failed'", [reportDate]) || {}).c || 0;

  const summary = {
    postsScanned,
    postsProcessed,
    newCampaigns,
    relevantMatches: relevant,
    suspiciousItems: suspicious,
    failedJobs,
    generatedAt: new Date().toISOString(),
  };

  const existing = get('SELECT id FROM daily_reports WHERE report_date = ?', [reportDate]);
  if (existing) {
    run(
      `UPDATE daily_reports SET summary = ?, posts_scanned = ?, posts_processed = ?, new_campaigns = ?,
       relevant_matches = ?, suspicious_items = ?, failed_jobs = ?, updated_at = datetime('now') WHERE report_date = ?`,
      [JSON.stringify(summary), postsScanned, postsProcessed, newCampaigns, relevant, suspicious, failedJobs, reportDate]
    );
  } else {
    run(
      `INSERT INTO daily_reports (report_date, summary, posts_scanned, posts_processed, new_campaigns,
       relevant_matches, suspicious_items, failed_jobs, email_sent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [reportDate, JSON.stringify(summary), postsScanned, postsProcessed, newCampaigns, relevant, suspicious, failedJobs]
    );
  }

  logger.info('Daily report generated', { date: reportDate, summary });
  res.json({ ok: true, date: reportDate, summary });
});

router.post('/smtp/test', (req, res) => {
  const configured = Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);
  res.json({
    configured,
    message: configured ? 'SMTP settings are present. A test email would be sent to the configured recipient.' : 'SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.',
    host: config.smtp.host || '(not set)',
    port: config.smtp.port,
    from: config.smtp.from,
    to: config.smtp.to || '(not set)',
  });
});

module.exports = router;

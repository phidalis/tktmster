/*
 * Ticketmaster email API - sends the ticket confirmation email via Resend.
 *
 * Deploy this folder to Render as a Node service.
 *
 * Environment variables (set in the Render dashboard -> Environment):
 *   RESEND_API_KEY  - your Resend API key (required)
 *   RESEND_FROM     - sender address, e.g. "Ticketmaster <onboarding@resend.dev>"
 *                     (optional; defaults to onboarding@resend.dev)
 *   PORT            - provided automatically by Render
 */
const express = require('express');

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(function (req, res, next) {
  var started = Date.now();
  res.on('finish', function () {
    console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.originalUrl + ' -> ' + res.statusCode + ' (' + (Date.now() - started) + 'ms)');
  });
  next();
});

app.get('/health', function (req, res) {
  res.json({ ok: true });
});

app.post('/api/send-email', async function (req, res) {
  var to = req.body && req.body.to;
  var subject = req.body && req.body.subject;
  var html = req.body && req.body.html;

  if (!to || !subject || !html) {
    return res.status(400).json({ error: 'Missing to, subject or html.' });
  }

  var apiKey = process.env.RESEND_API_KEY;
  var from = process.env.RESEND_FROM || 'Ticketmaster <onboarding@resend.dev>';

  if (!apiKey) {
    console.error('RESEND_API_KEY is not set on this server - add it in Render -> Environment and redeploy.');
    return res.status(500).json({ error: 'RESEND_API_KEY is not set on the server.' });
  }

try {
      console.log('Sending email to ' + to + ' via Resend...');
      var response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from: from, to: to, subject: subject, html: html })
      });
      var data = await response.json();
      console.log('Resend responded ' + response.status + ' for ' + to + ' : ' + ((data && data.message) || JSON.stringify(data)));
      if (!response.ok) {
        return res.status(response.status).json({
          error: (data && data.message) || 'Resend rejected the email.'
        });
      }
      return res.json({ ok: true, id: data.id });
    } catch (err) {
      console.error('Resend request error: ' + err.message);
      return res.status(500).json({ error: 'Could not reach Resend: ' + err.message });
    }
});

var port = process.env.PORT || 3001;
app.listen(port, function () {
  console.log('Ticketmaster email API listening on port ' + port);
});
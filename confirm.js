(async function () {
  await TMStore.ready;

  var body = document.getElementById('cf-body');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function parseSeats(str) {
    if (!str) return [];
    return String(str).split(';').map(function (chunk) {
      var p = chunk.trim().split(/\s+/);
      return { section: p[0] || '', row: p[1] || '', seat: p[2] || '' };
    }).filter(function (t) { return t.section || t.row || t.seat; });
  }

  function productCard(tickets) {
    if (!tickets.length) return '';
    var cards = tickets.map(function (t) {
      return '<div class="cf-ticket-card">' +
        '<div class="cf-ticket-title">Standard Ticket</div>' +
        '<div class="cf-ticket-table">' +
        '<span class="cf-ticket-head">SEC</span>' +
        '<span class="cf-ticket-head">ROW</span>' +
        '<span class="cf-ticket-head">SEAT</span>' +
        '<span class="cf-ticket-cell">' + esc(t.section) + '</span>' +
        '<span class="cf-ticket-cell">' + esc(t.row) + '</span>' +
        '<span class="cf-ticket-cell">' + esc(t.seat) + '</span>' +
        '</div></div>';
    }).join('');
    return '<div class="cf-ticket-list">' + cards + '</div>';
  }

  function eventHeader() {
    var name = event ? event.name : 'Event';
    var date = event ? TMStore.formatDate(event.starts) : '';
    var place = event ? [event.venue, event.location].filter(Boolean).join(', ') : '';
    return '<div class="cf-label">YOUR TICKETS</div>' +
      '<h1 class="cf-event-name">' + esc(name) + '</h1>' +
      (date ? '<div class="cf-event-date">' + esc(date) + '</div>' : '') +
      (place ? '<div class="cf-event-place">' + esc(place) + '</div>' : '');
  }

  function statusView(opts) {
    var tickets = parseSeats(order.seats);
    body.innerHTML =
      eventHeader() +
      '<div class="cf-divider"></div>' +
      '<div class="cf-status ' + opts.cls + '">' +
      '<div class="cf-status-icon">' + opts.icon + '</div>' +
      '<h2 class="cf-status-title">' + esc(opts.title) + '</h2>' +
      '<p class="cf-status-text">' + esc(opts.text) + '</p>' +
      '</div>' +
      productCard(tickets) +
      (opts.note ? '<p class="cf-note">' + esc(opts.note) + '</p>' : '');
  }

  var tok = param('token');
  var order = tok ? await TMStore.getOrderByToken(tok) : null;

  if (!order) {
    body.innerHTML =
      '<div class="cf-label">YOUR TICKETS</div>' +
      '<h1 class="cf-event-name">Link not valid</h1>' +
      '<p class="cf-note">This confirmation link is invalid or has expired. Please contact the person who sent you your tickets.</p>';
    return;
  }

  var event = await TMStore.getEvent(order.eventId);
  var tickets = parseSeats(order.seats);

  if (order.status === 'confirmed') {
    statusView({
      cls: 'ok',
      icon: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
      title: 'Tickets confirmed',
      text: 'Thank you, ' + order.clientName + '. Your tickets are confirmed.',
      note: 'Keep this confirmation. Present your ticket at the entrance on the day of the event.'
    });
    return;
  }

  if (order.status === 'rejected') {
    statusView({
      cls: 'bad',
      icon: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      title: 'Tickets declined',
      text: 'You have declined these tickets. The organizer has been notified.',
      note: 'If this was a mistake, ask the sender to issue the tickets again.'
    });
    return;
  }

  if (order.status === 'cancelled') {
    statusView({
      cls: 'bad',
      icon: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      title: 'Order cancelled',
      text: 'This ticket order has been cancelled. Please contact the person who sent it to you.'
    });
    return;
  }

  body.innerHTML =
    eventHeader() +
    '<div class="cf-divider"></div>' +
    '<div class="cf-greeting">' +
    '<p>Dear ' + esc(order.clientName) + ',</p>' +
    '<p>We sent these tickets to ' + esc(order.clientEmail) + '</p>' +
    '<p>Your section, row, and seat are below.</p>' +
    '</div>' +
    productCard(tickets) +
    '<div class="cf-payment">' +
    '<h2 class="cf-payment-title">Make payment and upload proof</h2>' +
    '<p class="cf-payment-text">Complete payment for these tickets, then upload your transaction receipt or a screenshot of the payment. The seller reviews it before you can accept.</p>' +
    '</div>' +
    '<input id="cf-proof" type="file" accept="image/*" hidden>' +
    '<div class="cf-upload" id="cf-drop">Click to upload payment proof</div>' +
    '<div class="cf-upload-preview" id="cf-proof-preview"></div>' +
    '<button class="cf-accept" id="cf-confirm" disabled>Accept Tickets</button>' +
    '<button class="cf-decline" id="cf-reject">Decline tickets</button>';

  var proof = null;

  document.getElementById('cf-drop').addEventListener('click', function () {
    document.getElementById('cf-proof').click();
  });

  document.getElementById('cf-proof').addEventListener('change', async function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var drop = document.getElementById('cf-drop');
    var preview = document.getElementById('cf-proof-preview');
    var btn = document.getElementById('cf-confirm');
    proof = null;
    btn.disabled = true;
    btn.classList.remove('cf-accept-active');
    preview.innerHTML = '<img src="' + URL.createObjectURL(file) + '" alt="Proof of payment">';
    drop.textContent = 'Uploading\u2026';
    try {
      var url = await TMStore.uploadImage(file);
      proof = { url: url, name: file.name };
      drop.textContent = 'Payment proof attached \u2013 click to change';
      btn.disabled = false;
      btn.classList.add('cf-accept-active');
    } catch (e) {
      proof = null;
      preview.innerHTML = '';
      drop.textContent = 'Upload failed \u2013 click to try again';
    }
  });

  document.getElementById('cf-confirm').addEventListener('click', async function () {
    var updated = await TMStore.confirmOrder(order.token, proof);
    if (!updated) { alert('Something went wrong. Please try again.'); return; }
    order = updated;
    statusView({
      cls: 'ok',
      icon: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>',
      title: 'Pending review',
      text: 'Thank you, ' + order.clientName + '. Your tickets are pending review.',
      note: 'You will receive a confirmation email once your payment proof has been reviewed.'
    });
  });

  document.getElementById('cf-reject').addEventListener('click', async function () {
    if (!confirm('Decline these tickets? The sender will be notified.')) return;
    var updated = await TMStore.rejectOrder(order.token, proof);
    if (!updated) { alert('Something went wrong. Please try again.'); return; }
    order = updated;
    statusView({
      cls: 'bad',
      icon: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      title: 'Tickets declined',
      text: 'You have declined these tickets. The organizer has been notified.',
      note: 'If this was a mistake, ask the sender to issue the tickets again.'
    });
  });
})();

(async function () {
  await TMStore.ready;

  var currentAdmin = await TMStore.currentAdmin();
  if (!currentAdmin) {
    window.location.replace('login.html');
    return;
  }

  var TOASTS = document.getElementById('toasts');
  var modal = document.getElementById('modal');
  var modalBox = document.getElementById('modal-box');
  var modalTitle = document.getElementById('modal-title');
  var modalBody = document.getElementById('modal-body');
  var modalFoot = document.getElementById('modal-foot');
  var currentView = 'overview';
  var orderFilter = 'all';
  var pendingImage = null;

  // Admin cache so table cells can resolve an agent without an async lookup.
  var admins = [];
  var adminById = {};

  function refreshAdminCache(list) {
    admins = list;
    adminById = {};
    admins.forEach(function (a) { adminById[a.id] = a; });
  }
  refreshAdminCache(await TMStore.listAdmins());

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function toast(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    TOASTS.appendChild(t);
    setTimeout(function () { t.remove(); }, 3000);
  }

  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var pad = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  async function eventMap() {
    var list = await TMStore.listEvents(currentAdmin);
    var map = {};
    list.forEach(function (e) { map[e.id] = e; });
    return map;
  }

  // ------------------------------------------------------------------
  // Modal
  // ------------------------------------------------------------------
  function openModal(title, body, buttons, wide) {
    modalTitle.textContent = title;
    modalBody.innerHTML = body;
    modalFoot.innerHTML = '';
    (buttons || []).forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn ' + (b.className || 'ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function () { if (b.onClick) b.onClick(); });
      modalFoot.appendChild(btn);
    });
    modalBox.classList.toggle('wide', !!wide);
    modal.classList.add('open');
  }

  function closeModal() {
    modal.classList.remove('open');
    modalBody.innerHTML = '';
    modalFoot.innerHTML = '';
    pendingImage = null;
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (ev) { if (ev.target === modal) closeModal(); });

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------
  var navItems = document.querySelectorAll('.nav-item');
  var titles = {
    overview: ['Overview', 'Your ticketing at a glance'],
    events: ['Events', 'Create and manage your events'],
    orders: ['Orders & Tickets', 'Issue tickets and track confirmations'],
    confirmed: ['Confirmed Tickets', 'Orders confirmed by clients'],
    payments: ['Payments', 'Proof of payment uploaded by clients'],
    admins: ['Admins', 'Manage admin accounts'],
    account: ['My Account', 'Your profile']
  };

  function switchView(view) {
    currentView = view;
    navItems.forEach(function (n) { n.classList.toggle('active', n.getAttribute('data-view') === view); });
    document.querySelectorAll('.section').forEach(function (s) {
      s.classList.toggle('active', s.id === 'view-' + view);
    });
    document.getElementById('view-title').textContent = titles[view][0];
    document.getElementById('view-sub').textContent = titles[view][1];
    document.getElementById('sidebar').classList.remove('open');
    renderActions();
    render();
  }

  navItems.forEach(function (n) {
    n.addEventListener('click', function () { switchView(n.getAttribute('data-view')); });
  });

  document.querySelectorAll('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.getAttribute('data-goto')); });
  });

  document.getElementById('menu-toggle').addEventListener('click', function () {
    document.getElementById('sidebar').classList.toggle('open');
  });

  document.getElementById('add-event-btn').addEventListener('click', function () { openEventModal(null); });
  document.getElementById('add-order-btn').addEventListener('click', openOrderModal);
  document.getElementById('add-admin-btn').addEventListener('click', openAdminModal);

  function doLogout() {
    TMStore.logout();
    window.location.replace('login.html');
  }

  document.getElementById('logout-btn').addEventListener('click', doLogout);
  document.getElementById('account-logout').addEventListener('click', doLogout);

  function renderActions() {
    var wrap = document.getElementById('view-actions');
    wrap.innerHTML = '';
    var defs = {
      events: [{ label: 'New event', cls: '', fn: function () { openEventModal(null); } }],
      orders: [{ label: 'New order', cls: '', fn: openOrderModal }],
      admins: currentAdmin.role === 'super' ? [{ label: 'New admin', cls: '', fn: openAdminModal }] : []
    };
    (defs[currentView] || []).forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'btn ' + (d.cls || 'ghost');
      b.textContent = d.label;
      b.addEventListener('click', d.fn);
      wrap.appendChild(b);
    });
  }

  // ------------------------------------------------------------------
  // Header + identity
  // ------------------------------------------------------------------
  document.getElementById('user-name').textContent = currentAdmin.name;
  document.getElementById('user-role').textContent = currentAdmin.role === 'super' ? 'Super admin \u00b7 ' + currentAdmin.identifier : 'Admin \u00b7 ' + currentAdmin.identifier;
  if (currentAdmin.role === 'super') document.getElementById('nav-admins').hidden = false;

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  async function updateCounts() {
    var s = await TMStore.stats(currentAdmin);
    document.getElementById('count-orders').textContent = s.pending;
    document.getElementById('count-confirmed').textContent = s.confirmed;
    document.getElementById('count-proofs').textContent = s.proofs;
  }

  async function render() {
    try {
      await updateCounts();
      if (currentView === 'overview') await renderOverview();
      else if (currentView === 'events') await renderEvents();
      else if (currentView === 'orders') await renderOrders();
      else if (currentView === 'confirmed') await renderConfirmed();
      else if (currentView === 'payments') await renderPayments();
      else if (currentView === 'admins') await renderAdmins();
      else if (currentView === 'account') renderAccount();
    } catch (e) {
      toast(e.message || 'Something went wrong', 'error');
    }
  }

  function statusBadge(status) {
    return '<span class="badge ' + status + '">' + status + '</span>';
  }

  function agentCell(order) {
    if (currentAdmin.role !== 'super') return '';
    var a = adminById[order.adminId];
    return '<td><span class="mono">' + esc(order.adminCode || (a ? a.identifier : '\u2014')) + '</span></td>';
  }

  function proofCell(order) {
    if (!order.proof) return '<td><span class="cell-sub">None</span></td>';
    return '<td><span class="badge proof">Uploaded</span></td>';
  }

  function emptyRow(cols, msg) {
    return '<tr><td colspan="' + cols + '"><div class="empty">' + msg + '</div></td></tr>';
  }

  function stat(label, value, cls) {
    return '<div class="stat"><div class="label">' + label + '</div><div class="value ' + (cls || '') + '">' + value + '</div></div>';
  }

  async function renderOverview() {
    var s = await TMStore.stats(currentAdmin);
    var grid = document.getElementById('stat-grid');
    grid.innerHTML =
      stat('Events', s.events, 'blue') +
      stat('Orders', s.orders, '') +
      stat('Pending', s.pending, 'amber') +
      stat('Confirmed', s.confirmed, 'green') +
      stat('Proofs', s.proofs, 'blue');

    var all = await TMStore.listOrders(currentAdmin);
    var recent = all.slice(0, 6);
    var map = await eventMap();
    var cols = currentAdmin.role === 'super' ? 7 : 6;
    var html = '<table><thead><tr><th>Order</th><th>Client</th><th>Event</th><th>Status</th>' +
      (currentAdmin.role === 'super' ? '<th>Agent</th>' : '') +
      '<th>Created</th><th></th></tr></thead><tbody>';
    if (!recent.length) {
      html += emptyRow(cols, 'No orders yet. Create one to get started.');
    } else {
      recent.forEach(function (o) {
        var ev = map[o.eventId];
        html += '<tr>' +
          '<td class="mono">' + esc(o.id) + '</td>' +
          '<td><div class="cell-title">' + esc(o.clientName) + '</div><div class="cell-sub">' + esc(o.clientEmail) + '</div></td>' +
          '<td>' + esc(ev ? ev.name : 'Deleted event') + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          agentCell(o) +
          '<td class="cell-sub">' + esc(TMStore.formatDate(o.createdAt)) + '</td>' +
          '<td><button class="btn ghost small" data-detail="' + o.id + '">View</button></td>' +
          '</tr>';
      });
    }
    html += '</tbody></table>';
    document.getElementById('overview-orders').innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  async function renderEvents() {
    var events = await TMStore.listEvents(currentAdmin);
    var orders = await TMStore.listOrders(currentAdmin);
    var wrap = document.getElementById('events-list');
    if (!events.length) {
      wrap.innerHTML = '<div class="panel"><div class="empty">No events yet. Click <strong>New event</strong> to create your first one.</div></div>';
      return;
    }
    wrap.innerHTML = '<div class="event-grid">' + events.map(function (e) {
      var sold = orders.filter(function (o) { return o.eventId === e.id; }).length;
      return '<div class="event-tile">' +
        '<div class="thumb" style="background-image:url(\'' + esc(e.image || '') + '\')"></div>' +
        '<div class="body">' +
        '<h4>' + esc(e.name) + '</h4>' +
        '<div class="meta">' + esc(e.category) + '<br>' + esc(TMStore.formatDate(e.starts)) + '<br>' + esc([e.venue, e.location].filter(Boolean).join(', ')) + '</div>' +
        '<div class="meta" style="margin-top:8px">' + sold + ' order(s)</div>' +
        '<div class="row"><button class="btn ghost small" data-edit-event="' + e.id + '">Edit</button>' +
        '<button class="btn danger small" data-del-event="' + e.id + '">Delete</button></div>' +
        '</div></div>';
    }).join('') + '</div>';
  }

  function eventField(label, id, value, ph) {
    return '<div class="field"><label>' + label + '</label><input id="' + id + '" type="text" value="' + esc(value || '') + '" placeholder="' + esc(ph || '') + '"></div>';
  }

  function ticketsToText(tickets) {
    return (tickets || []).map(function (t) {
      return [t.section, t.row, t.seat].join(', ');
    }).join('\n');
  }

  function textToTickets(text) {
    return String(text || '').split('\n').map(function (line) { return line.trim(); }).filter(Boolean).map(function (line) {
      var p = line.split(',');
      return { section: (p[0] || '').trim(), row: (p[1] || '').trim(), seat: (p[2] || '').trim() };
    });
  }

  function openEventModal(event) {
    var isEdit = !!event;
    event = event || {};
    pendingImage = null;
    var availableCount = isEdit && event.available != null ? event.available : '';
    var body =
      eventField('Event name', 'ev-name', event.name, 'e.g. Cross Culture Tour') +
      '<div class="field-row">' +
      '<div class="field"><label>Category</label><input id="ev-category" type="text" value="' + esc(event.category || 'Concert') + '"></div>' +
      '<div class="field"><label>Date &amp; time</label><input id="ev-starts" type="datetime-local" value="' + toLocalInput(event.starts) + '"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Venue</label><input id="ev-venue" type="text" value="' + esc(event.venue || '') + '"></div>' +
      '<div class="field"><label>City / Country</label><input id="ev-location" type="text" value="' + esc(event.location || '') + '"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Capacity</label><input id="ev-capacity" type="number" min="0" value="' + (event.capacity || 0) + '"></div>' +
      '<div class="field"><label>Order code (client tickets)</label><input id="ev-order" type="text" value="' + esc(event.order || '') + '" placeholder="TM-SEED-XXX"></div>' +
      '</div>' +
      '<div class="field"><label>Image URL</label><input id="ev-image-url" type="text" value="' + esc(event.image || '') + '" placeholder="https://..."></div>' +
      '<div class="field"><label>Or upload image</label><input id="ev-image-file" type="file" accept="image/*"></div>' +
      '<div class="field"><label>Seats / tickets &mdash; one per line (Section, Row, Seat)</label><textarea id="ev-tickets" placeholder="101, A, 12">' + esc(ticketsToText(event.tickets)) + '</textarea></div>' +
      '<div class="field"><label>Available count</label><input id="ev-available" type="number" min="0" value="' + availableCount + '" placeholder="Defaults to number of seats"></div>' +
      '<div class="field"><label>Description</label><textarea id="ev-description">' + esc(event.description || '') + '</textarea></div>';

    openModal(isEdit ? 'Edit event' : 'New event', body, [
      { label: 'Cancel', className: 'ghost', onClick: closeModal },
      { label: isEdit ? 'Save changes' : 'Create event', className: '', onClick: function () { saveEvent(isEdit ? event.id : null); } }
    ], true);

    document.getElementById('ev-image-file').addEventListener('change', async function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var urlField = document.getElementById('ev-image-url');
      urlField.value = 'Uploading\u2026';
      try {
        var url = await TMStore.uploadImage(file);
        pendingImage = url;
        urlField.value = url;
        toast('Image uploaded', 'success');
      } catch (e) {
        pendingImage = null;
        urlField.value = '';
        toast('Image upload failed', 'error');
      }
    });
  }

  async function saveEvent(id) {
    var tickets = textToTickets(val('ev-tickets'));
    var data = {
      name: val('ev-name'),
      category: val('ev-category'),
      venue: val('ev-venue'),
      location: val('ev-location'),
      starts: val('ev-starts'),
      capacity: val('ev-capacity'),
      description: val('ev-description'),
      order: val('ev-order'),
      tickets: tickets,
      available: val('ev-available') !== '' ? Number(val('ev-available')) : tickets.length,
      image: pendingImage || val('ev-image-url')
    };
    try {
      if (id) await TMStore.updateEvent(id, data);
      else await TMStore.createEvent(currentAdmin, data);
      toast(id ? 'Event updated' : 'Event created', 'success');
      closeModal();
      render();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ------------------------------------------------------------------
  // Orders
  // ------------------------------------------------------------------
  async function renderOrders() {
    var orders = await TMStore.listOrders(currentAdmin);
    var map = await eventMap();
    if (orderFilter !== 'all') {
      orders = orders.filter(function (o) { return o.status === orderFilter; });
    }
    document.querySelectorAll('#order-filters .chip').forEach(function (c) {
      c.classList.toggle('active', c.getAttribute('data-filter') === orderFilter);
    });

    var cols = currentAdmin.role === 'super' ? 8 : 7;
    var html = '<table><thead><tr><th>Order</th><th>Client</th><th>Event</th><th>Qty</th><th>Status</th>' +
      (currentAdmin.role === 'super' ? '<th>Agent</th>' : '') +
      '<th>Proof</th><th>Created</th><th></th></tr></thead><tbody>';
    if (!orders.length) {
      html += emptyRow(cols, 'No orders in this view.');
    } else {
      orders.forEach(function (o) {
        var ev = map[o.eventId];
        html += '<tr>' +
          '<td class="mono">' + esc(o.id) + (o.source === 'transfer' ? '<div><span class="badge proof">Transfer</span></div>' : '') + '</td>' +
          '<td><div class="cell-title">' + esc(o.clientName) + '</div><div class="cell-sub">' + esc(o.clientEmail) + '</div></td>' +
          '<td>' + esc(ev ? ev.name : 'Deleted event') + '</td>' +
          '<td>' + o.quantity + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          agentCell(o) +
          proofCell(o) +
          '<td class="cell-sub">' + esc(TMStore.formatDate(o.createdAt)) + '</td>' +
          '<td style="white-space:nowrap">' +
          '<button class="btn ghost small" data-send="' + o.id + '">' + (o.sentAt ? 'Resend' : 'Send email') + '</button> ' +
          '<button class="btn ghost small" data-detail="' + o.id + '">Details</button>' +
          '</td></tr>';
      });
    }
    html += '</tbody></table>';
    document.getElementById('orders-list').innerHTML = html;
  }

  async function openOrderModal() {
    var events = await TMStore.listEvents(currentAdmin);
    if (!events.length) { toast('Create an event first.', 'error'); return; }
    var options = events.map(function (e) {
      return '<option value="' + e.id + '">' + esc(e.name) + ' \u2013 ' + esc(TMStore.formatDate(e.starts)) + '</option>';
    }).join('');
    var body =
      '<div class="field"><label>Event</label><select id="or-event">' + options + '</select></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Client name</label><input id="or-name" type="text"></div>' +
      '<div class="field"><label>Client email</label><input id="or-email" type="email"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Phone</label><input id="or-phone" type="text"></div>' +
      '<div class="field"><label>Quantity</label><input id="or-qty" type="number" min="1" value="1"></div>' +
      '</div>' +
      '<div class="field"><label>Seats (e.g. Section 101, Row A, Seat 12)</label><input id="or-seats" type="text"></div>' +
      '<div class="field"><label>Notes</label><textarea id="or-notes"></textarea></div>';

    openModal('New order', body, [
      { label: 'Cancel', className: 'ghost', onClick: closeModal },
      { label: 'Create order', className: '', onClick: async function () {
        try {
          var order = await TMStore.createOrder(currentAdmin, {
            eventId: val('or-event'),
            clientName: val('or-name'),
            clientEmail: val('or-email'),
            clientPhone: val('or-phone'),
            quantity: val('or-qty'),
            seats: val('or-seats'),
            notes: val('or-notes')
          });
          toast('Order created', 'success');
          closeModal();
          render();
          openSendEmail(order);
        } catch (e) { toast(e.message, 'error'); }
      } }
    ], true);
  }

  async function openSendEmail(order) {
    order = (await TMStore.getOrder(order.id)) || order;
    var event = await TMStore.getEvent(order.eventId);
    var mail = TMStore.buildEmail(order, event, currentAdmin);
    var body =
      '<p class="cell-sub" style="margin-bottom:14px">Email sending will be connected later. For now this is the message that will be delivered to the client. Use the link to confirm on their behalf.</p>' +
      '<div class="detail-list">' +
      detailRow('To', esc(order.clientName) + ' &lt;' + esc(order.clientEmail) + '&gt;') +
      detailRow('Subject', esc(mail.subject)) +
      detailRow('Agent identifier', esc(mail.agent) + ' <span class="cell-sub">(internal only)</span>') +
      '</div>' +
      '<div class="link-box"><input id="mail-link" type="text" readonly value="' + esc(mail.link) + '">' +
      '<button class="btn ghost" id="copy-link" type="button">Copy</button></div>' +
      '<div class="email-preview">' + mail.html + '</div>';

    openModal('Send ticket email', body, [
      { label: 'Close', className: 'ghost', onClick: closeModal },
      { label: order.sentAt ? 'Mark sent again' : 'Mark as sent', className: '', onClick: async function () {
        await TMStore.updateOrder(order.id, { sentAt: TMStore.nowIso() });
        toast('Confirmation marked as sent', 'success');
        closeModal();
        render();
      } }
    ], true);

    document.getElementById('copy-link').addEventListener('click', function () {
      var input = document.getElementById('mail-link');
      input.select();
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(function () {});
      toast('Link copied', 'success');
    });
  }

  function detailRow(k, v) {
    return '<div class="detail-row"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';
  }

  async function openOrderDetail(order) {
    order = (await TMStore.getOrder(order.id)) || order;
    var event = await TMStore.getEvent(order.eventId);
    var body =
      '<div class="detail-list">' +
      detailRow('Order number', '<span class="mono">' + esc(order.id) + '</span>') +
      detailRow('Agent identifier', '<span class="mono">' + esc(order.adminCode) + '</span>') +
      detailRow('Event', esc(event ? event.name : 'Deleted event')) +
      detailRow('Source', order.source === 'transfer' ? 'Ticket transfer' : 'Manual') +
      detailRow('Status', statusBadge(order.status)) +
      detailRow('Client', esc(order.clientName)) +
      detailRow('Email', esc(order.clientEmail)) +
      detailRow('Phone', esc(order.clientPhone || '\u2014')) +
      detailRow('Quantity', order.quantity) +
      detailRow('Seats', esc(order.seats || '\u2014')) +
      detailRow('Notes', esc(order.notes || '\u2014')) +
      detailRow('Created', esc(TMStore.formatDate(order.createdAt))) +
      detailRow('Email sent', order.sentAt ? esc(TMStore.formatDate(order.sentAt)) : 'Not yet') +
      detailRow('Confirmed', order.confirmedAt ? esc(TMStore.formatDate(order.confirmedAt)) : 'Not yet') +
      '</div>' +
      '<div style="margin-top:18px">' +
      '<div class="cell-title" style="margin-bottom:6px">Proof of payment</div>' +
      (order.proof
        ? '<div class="proof-preview"><img src="' + order.proof + '" alt="Proof"></div>'
        : '<div class="proof-drop" id="proof-drop">Click to upload proof of payment (JPG/PNG)</div>') +
      '</div>' +
      '<input id="proof-input" type="file" accept="image/*" hidden>';

    var buttons = [];
    buttons.push({ label: 'Delete', className: 'danger', onClick: async function () {
      if (confirm('Delete this order permanently?')) { await TMStore.deleteOrder(order.id); toast('Order deleted'); closeModal(); render(); }
    } });
    if (order.status === 'pending') {
      buttons.push({ label: 'Cancel order', className: 'ghost', onClick: async function () {
        await TMStore.updateOrder(order.id, { status: 'cancelled' });
        toast('Order cancelled'); closeModal(); render();
      } });
      buttons.push({ label: 'Confirm now', className: 'ghost', onClick: async function () {
        await TMStore.confirmOrder(order.token, null);
        toast('Order confirmed', 'success'); closeModal(); render();
      } });
    }
    buttons.push({ label: order.sentAt ? 'Resend email' : 'Send email', className: 'ghost', onClick: function () { closeModal(); openSendEmail(order); } });
    buttons.push({ label: 'Close', className: '', onClick: closeModal });

    openModal('Order ' + order.id, body, buttons, true);

    var drop = document.getElementById('proof-drop');
    var input = document.getElementById('proof-input');
    if (drop) {
      drop.addEventListener('click', function () { input.click(); });
    }
    input.addEventListener('change', async function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      var drop = document.getElementById('proof-drop');
      if (drop) drop.textContent = 'Uploading\u2026';
      try {
        var url = await TMStore.uploadImage(file);
        await TMStore.attachProof(order.id, { url: url, name: file.name });
        toast('Proof uploaded', 'success');
        closeModal();
        render();
      } catch (e) {
        if (drop) drop.textContent = 'Upload failed \u2013 click to try again';
        toast('Upload failed', 'error');
      }
    });
  }

  async function viewProof(order) {
    order = (await TMStore.getOrder(order.id)) || order;
    var body = '<img src="' + order.proof + '" style="width:100%;border-radius:12px;border:1px solid #e5e7eb" alt="Proof of payment">' +
      '<div class="cell-sub" style="margin-top:10px">' + esc(order.proofName || 'Uploaded ' + TMStore.formatDate(order.proofUploadedAt)) + '</div>';
    openModal('Proof \u2013 ' + order.id, body, [{ label: 'Close', className: '', onClick: closeModal }], true);
  }

  // ------------------------------------------------------------------
  // Confirmed
  // ------------------------------------------------------------------
  async function renderConfirmed() {
    var orders = (await TMStore.listOrders(currentAdmin)).filter(function (o) { return o.status === 'confirmed'; });
    var map = await eventMap();
    document.getElementById('confirmed-sub').textContent = currentAdmin.role === 'super'
      ? 'Everyone\u2019s confirmed orders.'
      : 'Orders your clients have confirmed.';
    var cols = currentAdmin.role === 'super' ? 8 : 7;
    var html = '<table><thead><tr><th>Order</th><th>Client</th><th>Event</th><th>Qty</th><th>Seats</th>' +
      (currentAdmin.role === 'super' ? '<th>Agent</th>' : '') +
      '<th>Proof</th><th>Confirmed</th><th></th></tr></thead><tbody>';
    if (!orders.length) {
      html += emptyRow(cols, 'No confirmed tickets yet. Confirmed client orders will appear here.');
    } else {
      orders.forEach(function (o) {
        var ev = map[o.eventId];
        html += '<tr><td class="mono">' + esc(o.id) + '</td>' +
          '<td><div class="cell-title">' + esc(o.clientName) + '</div><div class="cell-sub">' + esc(o.clientEmail) + '</div></td>' +
          '<td>' + esc(ev ? ev.name : 'Deleted event') + '</td>' +
          '<td>' + o.quantity + '</td>' +
          '<td class="cell-sub">' + esc(o.seats || '\u2014') + '</td>' +
          agentCell(o) + proofCell(o) +
          '<td class="cell-sub">' + esc(TMStore.formatDate(o.confirmedAt)) + '</td>' +
          '<td><button class="btn ghost small" data-detail="' + o.id + '">View</button></td></tr>';
      });
    }
    html += '</tbody></table>';
    document.getElementById('confirmed-list').innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Payments
  // ------------------------------------------------------------------
  async function renderPayments() {
    var orders = (await TMStore.listOrders(currentAdmin)).filter(function (o) { return !!o.proof; });
    var map = await eventMap();
    var cols = currentAdmin.role === 'super' ? 6 : 5;
    var html = '<table><thead><tr><th>Order</th><th>Client</th><th>Event</th>' +
      (currentAdmin.role === 'super' ? '<th>Agent</th>' : '') +
      '<th>Uploaded</th><th></th></tr></thead><tbody>';
    if (!orders.length) {
      html += emptyRow(cols, 'No payment proofs uploaded yet.');
    } else {
      orders.forEach(function (o) {
        var ev = map[o.eventId];
        html += '<tr><td class="mono">' + esc(o.id) + '</td>' +
          '<td><div class="cell-title">' + esc(o.clientName) + '</div><div class="cell-sub">' + esc(o.clientEmail) + '</div></td>' +
          '<td>' + esc(ev ? ev.name : 'Deleted event') + '</td>' +
          agentCell(o) +
          '<td class="cell-sub">' + esc(TMStore.formatDate(o.proofUploadedAt)) + '</td>' +
          '<td><button class="btn ghost small" data-proof="' + o.id + '">View proof</button></td></tr>';
      });
    }
    html += '</tbody></table>';
    document.getElementById('payments-list').innerHTML = html;
  }

  // ------------------------------------------------------------------
  // Admins
  // ------------------------------------------------------------------
  async function renderAdmins() {
    if (currentAdmin.role !== 'super') { switchView('overview'); return; }
    refreshAdminCache(await TMStore.listAdmins());
    var orders = await TMStore.listOrders(null);
    var html = '<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Identifier</th><th>Orders</th><th>Created</th><th></th></tr></thead><tbody>';
    admins.forEach(function (a) {
      var count = orders.filter(function (o) { return o.adminId === a.id; }).length;
      html += '<tr>' +
        '<td class="cell-title">' + esc(a.name) + (a.id === currentAdmin.id ? ' <span class="cell-sub">(you)</span>' : '') + '</td>' +
        '<td>' + esc(a.email) + '</td>' +
        '<td><span class="badge role-' + a.role + '">' + a.role + '</span></td>' +
        '<td class="mono">' + esc(a.identifier) + '</td>' +
        '<td>' + count + '</td>' +
        '<td class="cell-sub">' + esc(TMStore.formatDate(a.createdAt)) + '</td>' +
        '<td>' + (a.role === 'super' ? '' : '<button class="btn danger small" data-del-admin="' + a.id + '">Delete</button>') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    document.getElementById('admins-list').innerHTML = html;
  }

  function openAdminModal() {
    var body =
      '<div class="field"><label>Full name</label><input id="ad-name" type="text"></div>' +
      '<div class="field"><label>Email</label><input id="ad-email" type="email"></div>' +
      '<div class="field"><label>Phone</label><input id="ad-phone" type="text"></div>' +
      '<div class="field"><label>Agent identifier</label><input id="ad-identifier" type="text" spellcheck="false" placeholder="Leave blank to auto-generate"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Password</label><input id="ad-password" type="password" placeholder="At least 6 characters"></div>' +
      '<div class="field"><label>Role</label><select id="ad-role"><option value="admin">Admin</option><option value="super">Super admin</option></select></div>' +
      '</div>' +
      '<p class="cell-sub">The new admin signs in on the same login page with these credentials and only sees the tickets they issue.</p>';
    openModal('New admin', body, [
      { label: 'Cancel', className: 'ghost', onClick: closeModal },
      { label: 'Create admin', className: '', onClick: async function () {
        try {
          var admin = await TMStore.createAdmin({
            name: val('ad-name'),
            email: val('ad-email'),
            phone: val('ad-phone'),
            identifier: val('ad-identifier'),
            password: val('ad-password'),
            role: val('ad-role'),
            createdBy: currentAdmin.id
          });
          toast('Admin created \u2013 ' + admin.identifier, 'success');
          closeModal();
          render();
        } catch (e) { toast(e.message, 'error'); }
      } }
    ]);
  }

  // ------------------------------------------------------------------
  // Account
  // ------------------------------------------------------------------
  function renderAccount() {
    document.getElementById('acc-identifier').value = currentAdmin.identifier;
    document.getElementById('acc-name').value = currentAdmin.name;
    document.getElementById('acc-email').value = currentAdmin.email;
    document.getElementById('acc-phone').value = currentAdmin.phone || '';
    document.getElementById('acc-password').value = '';
  }

  document.getElementById('account-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    try {
      var patch = { name: val('acc-name'), phone: val('acc-phone'), identifier: val('acc-identifier') };
      if (val('acc-password')) patch.password = val('acc-password');
      currentAdmin = await TMStore.updateAdmin(currentAdmin.id, patch);
      document.getElementById('user-name').textContent = currentAdmin.name;
      toast('Profile updated', 'success');
      renderAccount();
    } catch (e) { toast(e.message, 'error'); }
  });

  // ------------------------------------------------------------------
  // Global delegation
  // ------------------------------------------------------------------
  document.addEventListener('click', async function (ev) {
    function find(attr) {
      var node = ev.target;
      while (node && node !== document) {
        if (node.getAttribute && node.getAttribute(attr)) return node;
        node = node.parentNode;
      }
      return null;
    }
    var t;
    if ((t = find('data-detail'))) { openOrderDetail(await TMStore.getOrder(t.getAttribute('data-detail'))); return; }
    if ((t = find('data-send'))) { openSendEmail(await TMStore.getOrder(t.getAttribute('data-send'))); return; }
    if ((t = find('data-proof'))) { viewProof(await TMStore.getOrder(t.getAttribute('data-proof'))); return; }
    if ((t = find('data-edit-event'))) { openEventModal(await TMStore.getEvent(t.getAttribute('data-edit-event'))); return; }
    if ((t = find('data-del-event'))) {
      var id = t.getAttribute('data-del-event');
      if (confirm('Delete this event?')) { await TMStore.deleteEvent(id); toast('Event deleted'); render(); }
      return;
    }
    if ((t = find('data-del-admin'))) {
      var aid = t.getAttribute('data-del-admin');
      if (confirm('Delete this admin account?')) {
        try { await TMStore.deleteAdmin(aid); toast('Admin deleted'); render(); }
        catch (e) { toast(e.message, 'error'); }
      }
      return;
    }
  });

  document.querySelectorAll('#order-filters .chip').forEach(function (c) {
    c.addEventListener('click', function () { orderFilter = c.getAttribute('data-filter'); renderOrders(); });
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') closeModal();
  });

  // ------------------------------------------------------------------
  switchView('overview');
})();

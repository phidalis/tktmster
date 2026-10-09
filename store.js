/*
 * TMStore - shared data layer for the admin dashboard.
 *
 * Everything is persisted in localStorage so the app works with no server.
 * When you are ready to add a real backend + email sending, replace the
 * bodies of these functions with fetch() calls. Nothing else needs to change
 * because the rest of the app only talks to window.TMStore.
 */
(function (global) {
  var KEYS = {
    admins: 'tm_admins',
    events: 'tm_events',
    orders: 'tm_orders',
    session: 'tm_session',
    ident: 'tm_ident',
    seeded: 'tm_seeded_v1'
  };

  function read(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function token() {
    return uid('tok_') + Math.random().toString(36).slice(2, 8);
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    }
    return 'h' + h.toString(16);
  }

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(amount, currency) {
    var n = Number(amount || 0);
    var symbols = { USD: '$', EUR: '\u20ac', GBP: '\u00a3', KES: 'KSh ', NGN: '\u20a6', ZAR: 'R ' };
    var symbol = symbols[currency] || (currency ? currency + ' ' : '$');
    return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
      ' \u00b7 ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // ------------------------------------------------------------------
  // Seed
  // ------------------------------------------------------------------
  function init() {
    var admins = read(KEYS.admins, []);
    if (admins.length === 0) {
      var superAdmin = {
        id: uid('adm_'),
        name: 'Super Admin',
        email: 'admin@ticketmaster.com',
        pass: hash('admin123'),
        role: 'super',
        identifier: 'AGT-0001',
        phone: '',
        createdBy: null,
        createdAt: nowIso()
      };
      admins.push(superAdmin);
      write(KEYS.admins, admins);

      // Seed the events that already ship with index.html so they show up
      // in the admin dashboard ready for editing.
      if (read(KEYS.events, []).length === 0) {
        write(KEYS.events, seedEvents(superAdmin.id));
      }
      write(KEYS.orders, read(KEYS.orders, []));
    }
  }

  function seedEvents(adminId) {
    var base = {
      adminId: adminId,
      category: 'Concert',
      venue: '',
      price: 0,
      currency: 'USD',
      description: '',
      createdAt: nowIso()
    };
    function make(cfg) {
      var event = Object.assign({}, base, cfg);
      event.capacity = event.capacity != null ? event.capacity : event.tickets.length;
      event.available = event.tickets.length;
      return Object.assign({ id: uid('evt_') }, event);
    }
    return [
      make({
        name: 'Cross Culture Tour Nairobi',
        starts: '2026-10-02T19:00:00',
        location: 'Nairobi, Kenya',
        order: 'TM-SEED-BTS-CO',
        image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80',
        tickets: [
          { section: '101', row: 'A', seat: '12' },
          { section: '101', row: 'A', seat: '13' },
          { section: '101', row: 'B', seat: '07' }
        ]
      }),
      make({
        name: 'Blankets & Wine Festival',
        starts: '2026-10-17T14:00:00',
        location: 'Nairobi, Kenya',
        order: 'TM-SEED-BTS-BW',
        image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=800&q=80',
        tickets: [
          { section: 'GA', row: '1', seat: '21' },
          { section: 'GA', row: '1', seat: '22' },
          { section: 'GA', row: '2', seat: '05' },
          { section: 'GA', row: '2', seat: '06' },
          { section: 'GA', row: '3', seat: '14' }
        ]
      }),
      make({
        name: 'Sauti Sol Live Concert',
        starts: '2026-11-08T18:30:00',
        location: 'Mombasa, Kenya',
        order: 'TM-SEED-BTS-SS',
        image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80',
        tickets: [
          { section: 'VIP', row: 'C', seat: '01' },
          { section: 'VIP', row: 'C', seat: '02' }
        ]
      })
    ];
  }

  // ------------------------------------------------------------------
  // Admins
  // ------------------------------------------------------------------
  function listAdmins() {
    return read(KEYS.admins, []);
  }

  function getAdmin(id) {
    return listAdmins().filter(function (a) { return a.id === id; })[0] || null;
  }

  function findAdminByEmail(email) {
    var e = normalizeEmail(email);
    return listAdmins().filter(function (a) { return a.email === e; })[0] || null;
  }

  function getAdminByIdentifier(code) {
    var c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    return listAdmins().filter(function (a) { return String(a.identifier || '').toUpperCase() === c; })[0] || null;
  }

  function normalizeIdentifier(code) {
    return String(code || '').trim().toUpperCase();
  }

  function identifierExists(code, exceptId) {
    var c = normalizeIdentifier(code);
    if (!c) return false;
    return listAdmins().filter(function (a) {
      return a.id !== exceptId && normalizeIdentifier(a.identifier) === c;
    }).length > 0;
  }

  function makeIdentifier() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'AGT-' + out;
  }

  function validateIdentifier(code, exceptId) {
    var c = normalizeIdentifier(code);
    if (!/^AGT-[A-Z0-9]{4,20}$/.test(c)) {
      throw new Error('Identifier must look like AGT-XXXX (letters and numbers)');
    }
    if (identifierExists(c, exceptId)) throw new Error('That identifier is already in use');
    return c;
  }

  function nextIdentifier() {
    var code = makeIdentifier();
    var guard = 0;
    while (identifierExists(code) && guard++ < 50) code = makeIdentifier();
    return code;
  }

  function createAdmin(data) {
    var name = String(data.name || '').trim();
    var email = normalizeEmail(data.email);
    var password = String(data.password || '');
    if (!name) throw new Error('Name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid email is required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    if (findAdminByEmail(email)) throw new Error('An admin with that email already exists');

    var admins = listAdmins();
    var admin = {
      id: uid('adm_'),
      name: name,
      email: email,
      pass: hash(password),
      role: data.role === 'super' ? 'super' : 'admin',
      identifier: data.identifier ? validateIdentifier(data.identifier, null) : nextIdentifier(),
      phone: String(data.phone || '').trim(),
      createdBy: data.createdBy || null,
      createdAt: nowIso()
    };
    admins.push(admin);
    write(KEYS.admins, admins);
    return admin;
  }

  function updateAdmin(id, patch) {
    var admins = listAdmins();
    for (var i = 0; i < admins.length; i++) {
      if (admins[i].id === id) {
        var clean = Object.assign({}, patch);
        delete clean.id;
        delete clean.pass;
        if (patch.password) {
          if (String(patch.password).length < 6) throw new Error('Password must be at least 6 characters');
          admins[i].pass = hash(patch.password);
        }
        delete clean.password;
        if (patch.identifier != null) clean.identifier = validateIdentifier(patch.identifier, id);
        Object.assign(admins[i], clean);
        write(KEYS.admins, admins);
        return admins[i];
      }
    }
    throw new Error('Admin not found');
  }

  function deleteAdmin(id) {
    var admins = listAdmins();
    var target = getAdmin(id);
    if (target && target.role === 'super') throw new Error('The super admin cannot be deleted');
    write(KEYS.admins, admins.filter(function (a) { return a.id !== id; }));
  }

  function verifyLogin(email, password) {
    var admin = findAdminByEmail(email);
    if (!admin) return null;
    if (admin.pass !== hash(String(password || ''))) return null;
    return admin;
  }

  // ------------------------------------------------------------------
  // Session
  // ------------------------------------------------------------------
  function setSession(adminId) {
    write(KEYS.session, { adminId: adminId, at: nowIso() });
  }

  function getSession() {
    var s = read(KEYS.session, null);
    if (!s || !s.adminId) return null;
    return getAdmin(s.adminId);
  }

  function clearSession() {
    global.localStorage.removeItem(KEYS.session);
  }

  // ------------------------------------------------------------------
  // Identification (used by the client site to tie actions to an admin)
  // ------------------------------------------------------------------
  function setIdent(adminId) {
    write(KEYS.ident, { adminId: adminId, at: nowIso() });
  }

  function getIdent() {
    var s = read(KEYS.ident, null);
    if (!s || !s.adminId) return null;
    return getAdmin(s.adminId);
  }

  function clearIdent() {
    global.localStorage.removeItem(KEYS.ident);
  }

  // ------------------------------------------------------------------
  // Scope helper - super admin sees everything, others see their own
  // ------------------------------------------------------------------
  function belongsTo(admin, record) {
    if (!admin) return false;
    if (admin.role === 'super') return true;
    return record.adminId === admin.id;
  }

  function scopeRecords(admin, records) {
    return records.filter(function (r) { return belongsTo(admin, r); });
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  function listEvents(admin) {
    var events = read(KEYS.events, []);
    events.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return admin ? scopeRecords(admin, events) : events;
  }

  function getEvent(id) {
    return read(KEYS.events, []).filter(function (e) { return e.id === id; })[0] || null;
  }

  function createEvent(admin, data) {
    var events = read(KEYS.events, []);
    var tickets = Array.isArray(data.tickets) ? data.tickets : [];
    var event = {
      id: uid('evt_'),
      adminId: admin ? admin.id : null,
      name: String(data.name || '').trim(),
      category: String(data.category || 'Concert').trim(),
      venue: String(data.venue || '').trim(),
      location: String(data.location || '').trim(),
      starts: data.starts || '',
      price: Number(data.price || 0),
      currency: data.currency || 'USD',
      capacity: Number(data.capacity || 0),
      image: data.image || '',
      description: String(data.description || '').trim(),
      order: String(data.order || '').trim() || ('TM-' + Date.now().toString(36).toUpperCase().slice(-6)),
      tickets: tickets,
      available: data.available != null ? Number(data.available) : tickets.length,
      createdAt: nowIso()
    };
    if (!event.name) throw new Error('Event name is required');
    events.unshift(event);
    write(KEYS.events, events);
    return event;
  }

  function updateEvent(id, patch) {
    var events = read(KEYS.events, []);
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === id) {
        Object.assign(events[i], patch);
        write(KEYS.events, events);
        return events[i];
      }
    }
    throw new Error('Event not found');
  }

  function deleteEvent(id) {
    var events = read(KEYS.events, []);
    write(KEYS.events, events.filter(function (e) { return e.id !== id; }));
  }

  // ------------------------------------------------------------------
  // Orders / tickets
  // ------------------------------------------------------------------
  function listOrders(admin) {
    var orders = read(KEYS.orders, []);
    orders.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return admin ? scopeRecords(admin, orders) : orders;
  }

  function getOrder(id) {
    return read(KEYS.orders, []).filter(function (o) { return o.id === id; })[0] || null;
  }

  function getOrderByToken(tok) {
    return read(KEYS.orders, []).filter(function (o) { return o.token === tok; })[0] || null;
  }

  function createOrder(admin, data) {
    var orders = read(KEYS.orders, []);
    var event = getEvent(data.eventId);
    if (!event) throw new Error('Event not found');
    var order = {
      id: 'TM-' + Date.now().toString(36).toUpperCase().slice(-6) + Math.floor(Math.random() * 90 + 10),
      adminId: admin ? admin.id : null,
      adminCode: admin ? admin.identifier : '',
      eventId: data.eventId,
      clientName: String(data.clientName || '').trim(),
      clientEmail: normalizeEmail(data.clientEmail),
      clientPhone: String(data.clientPhone || '').trim(),
      quantity: Number(data.quantity || 1),
      seats: String(data.seats || '').trim(),
      notes: String(data.notes || '').trim(),
      source: data.source || 'manual',
      status: 'pending',
      token: token(),
      proof: null,
      proofName: '',
      proofUploadedAt: null,
      sentAt: null,
      confirmedAt: null,
      rejectedAt: null,
      createdAt: nowIso()
    };
    if (!order.clientName) throw new Error('Client name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(order.clientEmail)) throw new Error('A valid client email is required');
    orders.unshift(order);
    write(KEYS.orders, orders);
    return order;
  }

  function updateOrder(id, patch) {
    var orders = read(KEYS.orders, []);
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].id === id) {
        Object.assign(orders[i], patch);
        write(KEYS.orders, orders);
        return orders[i];
      }
    }
    throw new Error('Order not found');
  }

  function deleteOrder(id) {
    write(KEYS.orders, read(KEYS.orders, []).filter(function (o) { return o.id !== id; }));
  }

  function confirmOrder(tok, proof) {
    var orders = read(KEYS.orders, []);
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].token === tok) {
        orders[i].status = 'confirmed';
        orders[i].confirmedAt = nowIso();
        if (proof) {
          orders[i].proof = proof.dataUrl;
          orders[i].proofName = proof.name || '';
          orders[i].proofUploadedAt = nowIso();
        }
        write(KEYS.orders, orders);
        return orders[i];
      }
    }
    return null;
  }

  function attachProof(id, proof) {
    return updateOrder(id, {
      proof: proof.dataUrl,
      proofName: proof.name || '',
      proofUploadedAt: nowIso()
    });
  }

  function rejectOrder(tok, proof) {
    var orders = read(KEYS.orders, []);
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].token === tok) {
        orders[i].status = 'rejected';
        orders[i].rejectedAt = nowIso();
        if (proof) {
          orders[i].proof = proof.dataUrl;
          orders[i].proofName = proof.name || '';
          orders[i].proofUploadedAt = nowIso();
        }
        write(KEYS.orders, orders);
        return orders[i];
      }
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Base URL + confirmation link + email stub
  // ------------------------------------------------------------------
  function baseUrl() {
    var href = global.location.href.split('#')[0].split('?')[0];
    var dir = href.substring(0, href.lastIndexOf('/') + 1);
    if (/\/admin\/[^/]*$/.test(href)) {
      dir = dir.replace(/admin\/$/, '');
    }
    return dir;
  }

  function confirmLink(tok) {
    return baseUrl() + 'confirm.html?token=' + encodeURIComponent(tok);
  }

  /*
   * Email stub. When you wire up real email sending, call your API here and
   * pass this HTML as the body. The adminCode is embedded in the payload so
   * you can trace which agent created the order, but it is NOT rendered in
   * the client-facing HTML below.
   */
  function buildEmail(order, event, admin) {
    var link = confirmLink(order.token);
    var subject = 'Confirm your tickets \u2013 ' + (event ? event.name : 'Your event');
    var when = event ? formatDate(event.starts) : '';
    var where = event ? [event.venue, event.location].filter(Boolean).join(', ') : '';
    var html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111827">' +
      '<div style="background:#000;color:#fff;padding:18px 22px;font-size:20px;font-weight:700">' + esc(event ? event.name : 'Your tickets') + '</div>' +
      '<div style="padding:22px">' +
      '<p>Hi ' + esc(order.clientName) + ',</p>' +
      '<p>Your ticket order <strong>' + order.id + '</strong> is ready. Please review the details, then confirm or decline your tickets.</p>' +
      '<table style="border-collapse:collapse;margin:18px 0">' +
      '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Date</td><td style="padding:4px 0;font-weight:700">' + when + '</td></tr>' +
      '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Venue</td><td style="padding:4px 0;font-weight:700">' + where + '</td></tr>' +
      '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Seats</td><td style="padding:4px 0;font-weight:700">' + (order.seats || (order.quantity + ' ticket(s)')) + '</td></tr>' +
      '<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Quantity</td><td style="padding:4px 0;font-weight:700">' + order.quantity + '</td></tr>' +
      '</table>' +
      '<p><a href="' + link + '" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">Confirm tickets</a></p>' +
      '<p style="color:#6b7280;font-size:13px">If the button does not work, copy this link into your browser:<br>' + link + '</p>' +
      '</div>' +
      '<div style="padding:14px 22px;background:#f3f4f6;color:#9ca3af;font-size:12px">You received this email because a ticket was issued to you.</div>' +
      '</div>';
    return { subject: subject, html: html, link: link, agent: admin ? admin.identifier : '' };
  }

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------
  function stats(admin) {
    var orders = listOrders(admin);
    var events = listEvents(admin);
    var confirmed = orders.filter(function (o) { return o.status === 'confirmed'; });
    var pending = orders.filter(function (o) { return o.status === 'pending'; });
    var proofs = orders.filter(function (o) { return !!o.proof; });
    var revenue = confirmed.reduce(function (sum, o) {
      var ev = getEvent(o.eventId);
      return sum + (ev ? ev.price * o.quantity : 0);
    }, 0);
    return {
      events: events.length,
      orders: orders.length,
      pending: pending.length,
      confirmed: confirmed.length,
      proofs: proofs.length,
      revenue: revenue
    };
  }

  global.TMStore = {
    KEYS: KEYS,
    init: init,
    money: money,
    formatDate: formatDate,
    nowIso: nowIso,

    listAdmins: listAdmins,
    getAdmin: getAdmin,
    findAdminByEmail: findAdminByEmail,
    getAdminByIdentifier: getAdminByIdentifier,
    createAdmin: createAdmin,
    updateAdmin: updateAdmin,
    deleteAdmin: deleteAdmin,
    verifyLogin: verifyLogin,

    setSession: setSession,
    getSession: getSession,
    clearSession: clearSession,
    setIdent: setIdent,
    getIdent: getIdent,
    clearIdent: clearIdent,

    listEvents: listEvents,
    getEvent: getEvent,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,

    listOrders: listOrders,
    getOrder: getOrder,
    getOrderByToken: getOrderByToken,
    createOrder: createOrder,
    updateOrder: updateOrder,
    deleteOrder: deleteOrder,
    confirmOrder: confirmOrder,
    rejectOrder: rejectOrder,
    attachProof: attachProof,

    confirmLink: confirmLink,
    buildEmail: buildEmail,
    stats: stats
  };

  init();
})(window);

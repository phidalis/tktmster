/*
 * TMStore - shared data layer.
 *
 * Data (admins, events, orders) lives in Firebase Firestore. Admin sign-in
 * uses Firebase Authentication (email/password); an admin's Auth uid is the
 * document id in the `admins` collection. A public `agents` collection mirrors
 * just { id, name, identifier } so the public client site can resolve an agent
 * identifier without reading the private admin records.
 *
 * The public API is asynchronous: every function that reads or writes
 * Firestore returns a Promise, so callers use `await TMStore.xxx()`.
 *
 * `TMStore.ready` resolves once the app has bootstrapped. Every data function
 * awaits it internally, so callers normally do not need to touch it.
 */
(function (global) {
  var LOCAL_KEYS = {
    ident: 'tm_ident'
  };

  var COLLECTIONS = {
    admins: 'admins',
    agents: 'agents',
    events: 'events',
    orders: 'orders'
  };

  var CLOUDINARY = {
    cloudName: 'vk6zv1bq',
    uploadPreset: 'ticketmaster'
  };

  // Disable the right-click context menu on desktop (non-touch) devices.
  if (!('ontouchstart' in global)) {
    global.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  }

  // ------------------------------------------------------------------
  // Local (per-browser) storage helpers - ident only.
  // ------------------------------------------------------------------
  function readLocal(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeLocal(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function removeLocal(key) {
    try {
      global.localStorage.removeItem(key);
    } catch (e) {}
  }

  function uid(prefix) {
    return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function token() {
    return uid('tok_') + Math.random().toString(36).slice(2, 8);
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
  // Email sending (Resend backend on Render).
  // Replace EMAIL_API with your Render service URL after deploying server/.
  // ------------------------------------------------------------------
  var EMAIL_API = 'https://YOUR-RENDER-SERVICE-NAME.onrender.com';

  async function sendEmail(to, mail) {
    var base = String(EMAIL_API || '').replace(/\/+$/, '');
    if (!base || base.indexOf('YOUR-RENDER') !== -1) {
      throw new Error('Email sending is not connected yet. Set EMAIL_API in store.js to your Render URL (see server/ folder).');
    }
    var res = await fetch(base + '/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, subject: mail.subject, html: mail.html })
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || 'Email sending failed.');
    return data;
  }

  // ------------------------------------------------------------------
  // Image uploads (Cloudinary unsigned upload) - resolves to the secure URL.
  // ------------------------------------------------------------------
  function uploadImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { reject(new Error('No file selected')); return; }
      var url = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY.cloudName + '/image/upload';
      var form = new FormData();
      form.append('file', file);
      form.append('upload_preset', CLOUDINARY.uploadPreset);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.onload = function () {
        var res = null;
        try { res = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && res && (res.secure_url || res.url)) {
          resolve(res.secure_url || res.url);
        } else {
          reject(new Error((res && res.error && res.error.message) || 'Image upload failed'));
        }
      };
      xhr.onerror = function () { reject(new Error('Image upload failed')); };
      xhr.send(form);
    });
  }

  function db() {
    return global.db;
  }

  function auth() {
    return global.firebase && global.firebase.auth ? global.firebase.auth() : null;
  }

  function withId(doc) {
    var data = doc.data() || {};
    if (data.id == null) data.id = doc.id;
    return data;
  }

  function byCreatedDesc(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  // ------------------------------------------------------------------
  // Bootstrap
  // ------------------------------------------------------------------
  var readyPromise = null;

  function ready() {
    if (!readyPromise) readyPromise = Promise.resolve();
    return readyPromise;
  }

  // ------------------------------------------------------------------
  // Admins
  // ------------------------------------------------------------------
  async function listAdmins() {
    await ready();
    var snap = await db().collection(COLLECTIONS.admins).get();
    return snap.docs.map(withId);
  }

  async function getAdmin(id) {
    await ready();
    if (!id) return null;
    var doc = await db().collection(COLLECTIONS.admins).doc(id).get();
    return doc.exists ? withId(doc) : null;
  }

  async function findAdminByEmail(email) {
    await ready();
    var e = normalizeEmail(email);
    if (!e) return null;
    var snap = await db().collection(COLLECTIONS.admins).where('email', '==', e).limit(1).get();
    return snap.empty ? null : withId(snap.docs[0]);
  }

  async function getAdminByIdentifier(code) {
    await ready();
    var c = String(code || '').trim().toUpperCase();
    if (!c) return null;
    var snap = await db().collection(COLLECTIONS.agents).where('identifier', '==', c).limit(1).get();
    return snap.empty ? null : withId(snap.docs[0]);
  }

  function normalizeIdentifier(code) {
    return String(code || '').trim().toUpperCase();
  }

  async function identifierExists(code, exceptId) {
    var c = normalizeIdentifier(code);
    if (!c) return false;
    await ready();
    var snap = await db().collection(COLLECTIONS.admins).where('identifier', '==', c).get();
    return snap.docs.some(function (d) { return d.id !== exceptId; });
  }

  function makeIdentifier() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 8; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return 'AGT-' + out;
  }

  async function validateIdentifier(code, exceptId) {
    var c = normalizeIdentifier(code);
    if (!/^AGT-[A-Z0-9]{4,20}$/.test(c)) {
      throw new Error('Identifier must look like AGT-XXXX (letters and numbers)');
    }
    if (await identifierExists(c, exceptId)) throw new Error('That identifier is already in use');
    return c;
  }

  async function nextIdentifier() {
    var code = makeIdentifier();
    var guard = 0;
    while (await identifierExists(code) && guard++ < 50) code = makeIdentifier();
    return code;
  }

  async function createAdmin(data) {
    await ready();
    var name = String(data.name || '').trim();
    var email = normalizeEmail(data.email);
    var password = String(data.password || '');
    if (!name) throw new Error('Name is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('A valid email is required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    if (await findAdminByEmail(email)) throw new Error('An admin with that email already exists');

    var identifier = data.identifier ? await validateIdentifier(data.identifier, null) : await nextIdentifier();

    // Create the Auth account on a secondary app so the current super admin
    // stays signed in.
    var fbase = global.firebase;
    var secondary = fbase.initializeApp(fbase.app().options, 'creator-' + Date.now());
    var uid;
    try {
      var cred = await secondary.auth().createUserWithEmailAndPassword(email, password);
      uid = cred.user.uid;
    } finally {
      await secondary.delete();
    }

    var admin = {
      id: uid,
      name: name,
      email: email,
      role: data.role === 'super' ? 'super' : 'admin',
      identifier: identifier,
      phone: String(data.phone || '').trim(),
      createdBy: data.createdBy || null,
      createdAt: nowIso()
    };
    await db().collection(COLLECTIONS.admins).doc(uid).set(admin);
    await db().collection(COLLECTIONS.agents).doc(uid).set({ id: uid, name: name, identifier: identifier });
    return admin;
  }

  async function updateAdmin(id, patch) {
    await ready();
    var existing = await getAdmin(id);
    if (!existing) throw new Error('Admin not found');
    var clean = Object.assign({}, patch);
    delete clean.id;
    var password = clean.password;
    delete clean.password;
    if (password) {
      if (String(password).length < 6) throw new Error('Password must be at least 6 characters');
      var user = auth() && auth().currentUser;
      if (!user || user.uid !== id) throw new Error('You can only change your own password here');
      await user.updatePassword(password);
    }
    if (patch.identifier != null) clean.identifier = await validateIdentifier(patch.identifier, id);
    await db().collection(COLLECTIONS.admins).doc(id).set(clean, { merge: true });
    var updated = Object.assign({}, existing, clean);
    await db().collection(COLLECTIONS.agents).doc(id).set(
      { id: id, name: updated.name, identifier: updated.identifier }, { merge: true });
    return updated;
  }

  async function deleteAdmin(id) {
    await ready();
    var target = await getAdmin(id);
    if (target && target.role === 'super') throw new Error('The super admin cannot be deleted');
    await db().collection(COLLECTIONS.admins).doc(id).delete();
    await db().collection(COLLECTIONS.agents).doc(id).delete();
  }

  // ------------------------------------------------------------------
  // Authentication (Firebase Auth)
  // ------------------------------------------------------------------
  function login(email, password) {
    return auth().signInWithEmailAndPassword(normalizeEmail(email), String(password || ''))
      .then(function (cred) {
        return db().collection(COLLECTIONS.admins).doc(cred.user.uid).get();
      })
      .then(function (doc) {
        if (!doc.exists) {
          return auth().signOut().then(function () { throw new Error('This account is not an admin'); });
        }
        return withId(doc);
      });
  }

  function logout() {
    return auth().signOut();
  }

  function currentAdmin() {
    return new Promise(function (resolve) {
      var a = auth();
      if (!a) { resolve(null); return; }
      var settled = false;
      var unsub = a.onAuthStateChanged(function (user) {
        if (settled) return;
        settled = true;
        unsub();
        if (!user) { resolve(null); return; }
        db().collection(COLLECTIONS.admins).doc(user.uid).get()
          .then(function (doc) { resolve(doc.exists ? withId(doc) : null); })
          .catch(function () { resolve(null); });
      });
    });
  }

  // ------------------------------------------------------------------
  // Identification (client site ties actions to an admin)
  // ------------------------------------------------------------------
  function setIdent(adminId) {
    writeLocal(LOCAL_KEYS.ident, { adminId: adminId, at: nowIso() });
  }

  async function getIdent() {
    var s = readLocal(LOCAL_KEYS.ident, null);
    if (!s || !s.adminId) return null;
    await ready();
    var doc = await db().collection(COLLECTIONS.agents).doc(s.adminId).get();
    return doc.exists ? withId(doc) : null;
  }

  function clearIdent() {
    removeLocal(LOCAL_KEYS.ident);
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
  async function listEvents(admin) {
    await ready();
    var snap = await db().collection(COLLECTIONS.events).get();
    var events = snap.docs.map(withId);
    events.sort(byCreatedDesc);
    return admin ? scopeRecords(admin, events) : events;
  }

  async function getEvent(id) {
    await ready();
    if (!id) return null;
    var doc = await db().collection(COLLECTIONS.events).doc(id).get();
    return doc.exists ? withId(doc) : null;
  }

  async function createEvent(admin, data) {
    await ready();
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
    await db().collection(COLLECTIONS.events).doc(event.id).set(event);
    return event;
  }

  async function updateEvent(id, patch) {
    await ready();
    var existing = await getEvent(id);
    if (!existing) throw new Error('Event not found');
    await db().collection(COLLECTIONS.events).doc(id).set(patch, { merge: true });
    return Object.assign({}, existing, patch);
  }

  async function deleteEvent(id) {
    await ready();
    await db().collection(COLLECTIONS.events).doc(id).delete();
  }

  // ------------------------------------------------------------------
  // Orders / tickets
  // ------------------------------------------------------------------
  async function listOrders(admin) {
    await ready();
    var snap = await db().collection(COLLECTIONS.orders).get();
    var orders = snap.docs.map(withId);
    orders.sort(byCreatedDesc);
    return admin ? scopeRecords(admin, orders) : orders;
  }

  async function getOrder(id) {
    await ready();
    if (!id) return null;
    var doc = await db().collection(COLLECTIONS.orders).doc(id).get();
    return doc.exists ? withId(doc) : null;
  }

  async function getOrderByToken(tok) {
    await ready();
    if (!tok) return null;
    var snap = await db().collection(COLLECTIONS.orders).where('token', '==', tok).limit(1).get();
    return snap.empty ? null : withId(snap.docs[0]);
  }

  async function createOrder(admin, data) {
    await ready();
    var event = await getEvent(data.eventId);
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
    await db().collection(COLLECTIONS.orders).doc(order.id).set(order);
    return order;
  }

  async function updateOrder(id, patch) {
    await ready();
    var existing = await getOrder(id);
    if (!existing) throw new Error('Order not found');
    await db().collection(COLLECTIONS.orders).doc(id).set(patch, { merge: true });
    return Object.assign({}, existing, patch);
  }

  async function deleteOrder(id) {
    await ready();
    await db().collection(COLLECTIONS.orders).doc(id).delete();
  }

  // Proof images are uploaded elsewhere (e.g. Cloudinary); we only persist the
  // resulting URL plus metadata. `proof` may be { url } or a legacy { dataUrl }.
  function proofPatch(proof) {
    return {
      proof: proof.url || proof.dataUrl || '',
      proofName: proof.name || '',
      proofUploadedAt: nowIso()
    };
  }

  async function confirmOrder(tok, proof) {
    await ready();
    var order = await getOrderByToken(tok);
    if (!order) return null;
    var patch = { status: 'confirmed', confirmedAt: nowIso() };
    if (proof) Object.assign(patch, proofPatch(proof));
    await db().collection(COLLECTIONS.orders).doc(order.id).set(patch, { merge: true });
    return Object.assign({}, order, patch);
  }

  async function attachProof(id, proof) {
    return updateOrder(id, proofPatch(proof));
  }

  async function rejectOrder(tok, proof) {
    await ready();
    var order = await getOrderByToken(tok);
    if (!order) return null;
    var patch = { status: 'rejected', rejectedAt: nowIso() };
    if (proof) Object.assign(patch, proofPatch(proof));
    await db().collection(COLLECTIONS.orders).doc(order.id).set(patch, { merge: true });
    return Object.assign({}, order, patch);
  }

  // ------------------------------------------------------------------
  // Live updates (client site)
  // ------------------------------------------------------------------
  function watchEvents(callback) {
    var unsub = function () {};
    ready().then(function () {
      if (!db()) return;
      unsub = db().collection(COLLECTIONS.events).onSnapshot(function (snap) {
        var events = snap.docs.map(withId);
        events.sort(byCreatedDesc);
        callback(events);
      });
    });
    return function () { unsub(); };
  }

  // ------------------------------------------------------------------
  // Base URL + confirmation link + email
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

  function parseSeatList(str) {
    if (!str) return [];
    return String(str).split(';').map(function (chunk) {
      var p = chunk.trim().split(/\s+/);
      return { section: p[0] || '', row: p[1] || '', seat: p[2] || '' };
    }).filter(function (t) { return t.section || t.row || t.seat; });
  }

  function buildEmail(order, event, admin) {
    var link = confirmLink(order.token);
    var eventName = event ? event.name : 'Your event';
    var place = event ? [event.venue, event.location].filter(Boolean).join(', ') : '';
    var subject = 'We\u2019ve sent you tickets for ' + eventName + (place ? ' \u2013 ' + place : '');
    var when = event ? formatDate(event.starts) : '';
    var img = event ? event.image : '';
    var tickets = parseSeatList(order.seats);
    var qty = order.quantity || tickets.length || 1;

    var logoUrl = baseUrl() + 'logo-email.svg';

    var eventCard =
      '<div style="border:1px solid #e5e7eb;border-radius:0;overflow:hidden;margin:0 0 16px">' +
      '<div style="height:180px;background-size:cover;background-position:center;background-color:#e5e7eb;background-image:url(\'' + esc(img) + '\')"></div>' +
      '<div style="background:#000;padding:10px 12px">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:0.4px;color:#fff;margin-bottom:3px">' + esc(when) + '</div>' +
      '<div style="font-size:14px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:6px">' + esc(eventName) + '</div>' +
      '<div style="width:18px;height:2px;background:#4b5563;border-radius:0;margin:0 0 6px"></div>' +
      '<div style="font-size:11px;color:#9ca3af">' + esc(place) + '</div>' +
      '</div></div>';

    var qtyLabel = qty + ' Ticket' + (qty !== 1 ? 's' : '');

    var ticketRows = tickets.map(function (t) {
      return '<table style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:0;margin:0 0 8px;width:100%">' +
        '<tr>' +
        '<td colspan="3" style="padding:10px 14px;border-bottom:1px solid #e5e7eb">' +
        '<div style="font-size:13px;font-weight:700;color:#111827">Standard Ticket</div>' +
        '</td>' +
        '</tr>' +
        '<tr>' +
        '<td style="padding:10px 14px;border-right:1px solid #e5e7eb">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">SEC</div>' +
        '<div style="font-size:13px;font-weight:600;color:#111827">' + esc(t.section) + '</div>' +
        '</td>' +
        '<td style="padding:10px 14px;border-right:1px solid #e5e7eb">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">ROW</div>' +
        '<div style="font-size:13px;font-weight:600;color:#111827">' + esc(t.row) + '</div>' +
        '</td>' +
        '<td style="padding:10px 14px">' +
        '<div style="font-size:10px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#9ca3af;margin-bottom:3px">SEAT</div>' +
        '<div style="font-size:13px;font-weight:600;color:#111827">' + esc(t.seat) + '</div>' +
        '</td>' +
        '</tr>' +
        '</table>';
    }).join('');

    if (!tickets.length) {
      ticketRows =
        '<div style="border:1px solid #e5e7eb;border-radius:0;padding:12px 14px;margin:0 0 8px">' +
        '<div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:6px">Standard Ticket</div>' +
        '<div style="font-size:13px;color:#6b7280">' + esc(order.seats || qty + ' ticket(s)') + '</div>' +
        '</div>';
    }

    var html =
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#111827;background:#f4f6fb;padding:16px">' +

      /* Header card */
      '<div style="border:1px solid #e5e7eb;border-radius:0;padding:14px 24px;margin-bottom:4px;text-align:left;background:#ffffff">' +
      '<div style="line-height:0">' +
      '<img src="' + logoUrl + '" alt="" width="30" height="30" style="display:inline-block;vertical-align:middle;border:0;border-radius:0;margin:0">' +
      '<span style="display:inline-block;vertical-align:middle;font-size:18px;font-weight:700;color:#111827;margin-left:6px">ticketmaster</span>' +
      '</div>' +
      '</div>' +

      /* Body card */
      '<div style="border:1px solid #e5e7eb;border-radius:0;padding:24px;margin-bottom:4px;background:#ffffff">' +
      '<p style="margin:0 0 12px;font-size:14px;color:#111827">Hi ' + esc(order.clientName) + ',</p>' +
      '<p style="margin:0 0 6px;font-size:18px;font-weight:700;color:#111827">We\u2019ve sent you tickets</p>' +
      '<p style="margin:0 0 20px;font-size:14px;color:#6b7280">View this ticket to see your section, row, seat.</p>' +

      eventCard +

      '<div style="margin:0 0 16px">' +
      '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:8px">' + qtyLabel + '</div>' +
      ticketRows +
      '</div>' +

      /* View Tickets bar */
      '<a href="' + link + '" style="display:block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:14px 0;border-radius:0;font-size:14px;font-weight:700;text-align:center;margin:0 0 16px">View Tickets</a>' +

      '<p style="margin:0 0 4px;font-size:13px;color:#6b7280">Sent to <strong style="color:#111827">' + esc(order.clientEmail) + '</strong></p>' +
      '<p style="margin:0 0 0;font-size:13px;color:#6b7280">Open view ticket to see your seats.</p>' +
      '</div>' +

      /* Footer card */
      '<div style="border:1px solid #e5e7eb;border-radius:0;padding:20px 24px;background:#f9fafb;text-align:left">' +
      '<div style="line-height:0">' +
      '<img src="' + logoUrl + '" alt="" width="22" height="22" style="display:inline-block;vertical-align:middle;border:0;border-radius:0;margin:0">' +
      '<span style="display:inline-block;vertical-align:middle;font-size:14px;font-weight:700;color:#111827;margin-left:5px">ticketmaster</span>' +
      '</div>' +
      '<div style="text-align:left;margin-top:10px;font-size:12px;color:#9ca3af">' +
      '<a href="#" style="color:#6b7280;text-decoration:none">Help</a>' +
      ' <span style="color:#d1d5db">|</span> ' +
      '<a href="#" style="color:#6b7280;text-decoration:none">Terms of Use</a>' +
      ' <span style="color:#d1d5db">|</span> ' +
      '<a href="#" style="color:#6b7280;text-decoration:none">Privacy</a>' +
      '</div>' +
      '<div style="text-align:left;margin-top:8px;font-size:12px;color:#9ca3af">This email was sent by Ticketmaster. \u00a9 All rights reserved</div>' +
      '</div>' +

      '</div>';

    return { subject: subject, html: html, link: link, agent: admin ? admin.identifier : '' };
  }

  // ------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------
  async function stats(admin) {
    var orders = await listOrders(admin);
    var events = await listEvents(admin);
    var priceById = {};
    events.forEach(function (e) { priceById[e.id] = e.price || 0; });
    var confirmed = orders.filter(function (o) { return o.status === 'confirmed'; });
    var pending = orders.filter(function (o) { return o.status === 'pending'; });
    var proofs = orders.filter(function (o) { return !!o.proof; });
    var revenue = confirmed.reduce(function (sum, o) {
      var price = priceById[o.eventId];
      return sum + (price != null ? price * o.quantity : 0);
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
    ready: ready,
    money: money,
    formatDate: formatDate,
    nowIso: nowIso,
    uploadImage: uploadImage,
    sendEmail: sendEmail,

    listAdmins: listAdmins,
    getAdmin: getAdmin,
    findAdminByEmail: findAdminByEmail,
    getAdminByIdentifier: getAdminByIdentifier,
    createAdmin: createAdmin,
    updateAdmin: updateAdmin,
    deleteAdmin: deleteAdmin,

    login: login,
    logout: logout,
    currentAdmin: currentAdmin,

    setIdent: setIdent,
    getIdent: getIdent,
    clearIdent: clearIdent,

    listEvents: listEvents,
    getEvent: getEvent,
    createEvent: createEvent,
    updateEvent: updateEvent,
    deleteEvent: deleteEvent,
    watchEvents: watchEvents,

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
})(window);

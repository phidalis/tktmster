(function () {
  var body = document.getElementById('cf-body');
  var title = document.getElementById('cf-title');
  var sub = document.getElementById('cf-sub');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function readImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1200, w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(c.toDataURL('image/jpeg', 0.72), file.name);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : '';
  }

  var tok = param('token');
  var order = tok ? TMStore.getOrderByToken(tok) : null;

  if (!order) {
    title.textContent = 'Link not valid';
    sub.textContent = 'We could not find this ticket';
    body.innerHTML = '<p class="confirm-note">This confirmation link is invalid or has expired. Please contact the person who sent you your tickets.</p>';
    return;
  }

  var event = TMStore.getEvent(order.eventId);

  function eventStub() {
    return '<div class="ticket-stub">' +
      '<div class="tname">' + esc(event ? event.name : 'Event') + '</div>' +
      '<div class="tmeta">' +
      (event ? esc(TMStore.formatDate(event.starts)) + '<br>' + esc([event.venue, event.location].filter(Boolean).join(', ')) + '<br>' : '') +
      'Order: <strong>' + esc(order.id) + '</strong><br>' +
      'Tickets: <strong>' + order.quantity + '</strong>' + (order.seats ? ' \u00b7 ' + esc(order.seats) : '') +
      '</div></div>';
  }

  function showConfirmed(justNow) {
    title.textContent = 'Tickets confirmed';
    sub.textContent = 'Thank you, ' + order.clientName;
    body.innerHTML =
      (justNow ? '<div class="confirm-done"><div class="check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></div>' +
        '<h2>You are all set</h2><p>Your tickets are confirmed. A copy has been recorded for the organizer.</p></div>' : '') +
      eventStub() +
      '<p class="confirm-note">Keep this confirmation. Present your ticket at the entrance on the day of the event.</p>';
  }

  function showRejected(justNow) {
    title.textContent = 'Tickets declined';
    sub.textContent = 'Order ' + order.id;
    body.innerHTML =
      (justNow ? '<div class="confirm-done"><div class="check" style="background:#fdecec;color:#dc2626"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></div>' +
        '<h2>Transfer declined</h2><p>You have declined these tickets. The organizer has been notified.</p></div>' : '') +
      eventStub() +
      '<p class="confirm-note">If this was a mistake, ask the sender to issue the tickets again.</p>';
  }

  if (order.status === 'confirmed') {
    showConfirmed(false);
    return;
  }

  if (order.status === 'rejected') {
    showRejected(false);
    return;
  }

  if (order.status === 'cancelled') {
    title.textContent = 'Order cancelled';
    sub.textContent = 'Order ' + order.id;
    body.innerHTML = '<p class="confirm-note">This ticket order has been cancelled. Please contact the person who sent it to you.</p>' + eventStub();
    return;
  }

  title.textContent = 'Confirm your tickets';
  sub.textContent = 'Order ' + order.id;

  body.innerHTML =
    '<p class="confirm-note">Hi ' + esc(order.clientName) + ', please review your ticket details, then confirm or decline them. You can also upload your proof of payment.</p>' +
    eventStub() +
    '<input id="cf-proof" type="file" accept="image/*" hidden>' +
    '<div class="proof-drop" id="cf-drop">Optional: click to upload proof of payment</div>' +
    '<div class="proof-preview" id="cf-proof-preview"></div>' +
    '<button class="btn block" id="cf-confirm" style="margin-top:18px">Confirm my tickets</button>' +
    '<button class="btn ghost block" id="cf-reject" style="margin-top:10px">Decline tickets</button>';

  var proof = null;

  document.getElementById('cf-drop').addEventListener('click', function () {
    document.getElementById('cf-proof').click();
  });

  document.getElementById('cf-proof').addEventListener('change', function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    readImage(file, function (dataUrl, name) {
      proof = { dataUrl: dataUrl, name: name };
      document.getElementById('cf-proof-preview').innerHTML = '<img src="' + dataUrl + '" alt="Proof of payment">';
      document.getElementById('cf-drop').textContent = 'Payment proof attached \u2013 click to change';
    });
  });

  document.getElementById('cf-confirm').addEventListener('click', function () {
    var updated = TMStore.confirmOrder(order.token, proof);
    if (!updated) { alert('Something went wrong. Please try again.'); return; }
    order = updated;
    showConfirmed(true);
  });

  document.getElementById('cf-reject').addEventListener('click', function () {
    if (!confirm('Decline these tickets? The sender will be notified.')) return;
    var updated = TMStore.rejectOrder(order.token, proof);
    if (!updated) { alert('Something went wrong. Please try again.'); return; }
    order = updated;
    showRejected(true);
  });
})();

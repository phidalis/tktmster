window.addEventListener('load', async function () {
  var splash = document.getElementById('splash');
  setTimeout(function () {
    splash.classList.add('hide');
    splash.addEventListener('transitionend', function () {
      splash.remove();
    });
  }, 1500);

  function mapStoreEvent(e) {
    return {
      id: e.id,
      name: e.name,
      starts: e.starts,
      location: e.location,
      available: e.available != null ? e.available : (e.tickets ? e.tickets.length : 0),
      order: e.order || e.id,
      image: e.image || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=800&q=80',
      tickets: e.tickets || []
    };
  }

  async function loadEvents() {
    if (!window.TMStore) return [];
    var list = await TMStore.listEvents(null);
    return list.map(mapStoreEvent);
  }

  var events = await loadEvents();

  // ------------------------------------------------------------------
  // Identification - lives in the My Account (profile) section.
  // Content is always shown; only actions require an identifier.
  // ------------------------------------------------------------------
  var identifiedAdmin = window.TMStore ? await TMStore.getIdent() : null;
  var eventsSection = document.getElementById('events');
  var profile = document.getElementById('profile');
  var profileForm = document.getElementById('profile-form');
  var profileInput = document.getElementById('profile-input');
  var profileError = document.getElementById('profile-error');
  var profilePrompt = document.getElementById('profile-prompt');
  var profileIdentified = document.getElementById('profile-identified');
  var profileName = document.getElementById('profile-name');
  var profileCode = document.getElementById('profile-code');
  var profileDefaultPrompt = profilePrompt ? profilePrompt.textContent : '';
  var pendingAfterIdent = null;

  function setBottomTab(name) {
    var btns = document.querySelectorAll('#tabbar .tab-btn');
    btns.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
  }

  function renderProfile() {
    if (!profile) return;
    if (identifiedAdmin) {
      profileIdentified.hidden = false;
      profileForm.hidden = true;
      profileName.textContent = identifiedAdmin.name || identifiedAdmin.email || '';
      profileCode.textContent = identifiedAdmin.identifier;
    } else {
      profileIdentified.hidden = true;
      profileForm.hidden = false;
      profilePrompt.textContent = profileDefaultPrompt;
      profileError.hidden = true;
    }
  }

  function showProfile() {
    eventsSection.style.display = 'none';
    profile.classList.add('open');
    profile.setAttribute('aria-hidden', 'false');
    renderProfile();
  }

  function hideProfile() {
    profile.classList.remove('open');
    profile.setAttribute('aria-hidden', 'true');
    eventsSection.style.display = '';
  }

  async function submitIdentify() {
    var code = profileInput.value.trim();
    var admin = window.TMStore ? await TMStore.getAdminByIdentifier(code) : null;
    if (!admin) {
      profileError.textContent = 'No admin found with identifier "' + code + '". Check it in your admin account.';
      profileError.hidden = false;
      return;
    }
    if (admin.suspended) {
      profileError.textContent = 'Your account has been suspended. Contact the super admin for help.';
      profileError.hidden = false;
      return;
    }
    identifiedAdmin = admin;
    TMStore.setIdent(admin.id);
    profileInput.value = '';
    renderProfile();
    var resume = pendingAfterIdent;
    pendingAfterIdent = null;
    hideProfile();
    setBottomTab('discover');
    if (resume) resume();
  }

  function requireIdent(message, after) {
    if (identifiedAdmin) return true;
    pendingAfterIdent = after || null;
    showProfile();
    profileForm.hidden = false;
    profileIdentified.hidden = true;
    profilePrompt.textContent = message || 'Identification required. Enter your agent identifier to continue.';
    profileError.hidden = true;
    if (profileInput) {
      setTimeout(function () { profileInput.focus(); }, 50);
    }
    return false;
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      await submitIdentify();
    });
  }
  var profileSwitch = document.getElementById('profile-switch');
  if (profileSwitch) {
    profileSwitch.addEventListener('click', function () {
      TMStore.clearIdent();
      identifiedAdmin = null;
      profileInput.value = '';
      renderProfile();
      profileInput.focus();
    });
  }
  var profileOpenAdmin = document.getElementById('profile-open-admin');
  if (profileOpenAdmin) {
    profileOpenAdmin.addEventListener('click', function () {
      window.location.href = 'admin/dashboard.html';
    });
  }
  renderProfile();

  if (identifiedAdmin && identifiedAdmin.suspended) {
    TMStore.clearIdent();
    identifiedAdmin = null;
    renderProfile();
    profileError.textContent = 'Your account has been suspended. Contact the super admin for help.';
    profileError.hidden = false;
  }

  function formatDate(iso) {
    var d = new Date(iso);
    var weekday = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    var month = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    var day = d.getDate();
    var year = d.getFullYear();
    var hours = d.getHours();
    var ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    var minutes = ('0' + d.getMinutes()).slice(-2);
    return weekday + ' . ' + month + ' ' + day + ', ' + year + ' . ' + hours + ':' + minutes + ' ' + ampm;
  }

  function renderEvents(list) {
    var wrap = document.getElementById('events');
    wrap.innerHTML = list.map(function (e) {
      var index = events.indexOf(e);
      return (
        '<article class="event-card" data-index="' + index + '">' +
        '  <div class="event-image" style="background-image:url(\'' + e.image + '\')"></div>' +
        '  <div class="event-info">' +
        '    <span class="event-date">' + formatDate(e.starts) + '</span>' +
        '    <h3 class="event-name">' + e.name + '</h3>' +
        '    <div class="event-dash"></div>' +
        '    <div class="event-bottom">' +
        '      <span class="event-location">' + e.location + '</span>' +
        '      <span class="event-avail">' +
        '        <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M15 6v12"></path></svg>x' + e.available +
        '      </span>' +
        '    </div>' +
        '  </div>' +
        '</article>'
      );
    }).join('');
  }

  function eventsFor(which) {
    var now = new Date();
    var filtered = events.filter(function (e) {
      return which === 'past'
        ? new Date(e.starts) < now
        : new Date(e.starts) >= now;
    });
    filtered.sort(function (a, b) {
      return which === 'past'
        ? new Date(b.starts) - new Date(a.starts)
        : new Date(a.starts) - new Date(b.starts);
    });
    return filtered;
  }

  renderEvents(eventsFor('upcoming'));

  var tabs = document.querySelectorAll('#togglebar .tab');

  function updateTabLabels() {
    tabs.forEach(function (tab) {
      var which = tab.getAttribute('data-tab');
      var label = which === 'past' ? 'Past' : 'Upcoming';
      var count = eventsFor(which).length;
      tab.textContent = count > 0 ? label + ' (' + count + ')' : label;
    });
  }

  updateTabLabels();

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
      renderEvents(eventsFor(tab.getAttribute('data-tab')));
    });
  });

  var bottomTabs = document.querySelectorAll('#tabbar .tab-btn');
  bottomTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      bottomTabs.forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
      if (tab.getAttribute('data-tab') === 'account') {
        showProfile();
      } else {
        hideProfile();
      }
    });
  });

  var modal = document.getElementById('modal');
  var modalScroll = document.getElementById('modal-scroll');
  var modalImage = document.getElementById('modal-image');
  var modalDate = document.getElementById('modal-date');
  var modalName = document.getElementById('modal-name');
  var modalLocation = document.getElementById('modal-location');
  var modalAvail = document.getElementById('modal-avail');
  var modalOrderNumber = document.getElementById('modal-order-number');
  var modalOrderTickets = document.getElementById('modal-order-tickets');
  var modalTicketsList = document.getElementById('modal-tickets-list');

  var ticketView = document.getElementById('ticket-view');
  var ticketTrack = document.getElementById('ticket-track');
  var ticketViewEvent = null;

  function barcodeSvg(seed) {
    var s = 0;
    for (var i = 0; i < seed.length; i++) s += seed.charCodeAt(i) * (i + 1);
    function rnd() {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    }
    var W = 300, H = 48, out = '', x = 0;
    function bars(until, minW, maxW) {
      while (x < until) {
        var w = minW + Math.floor(rnd() * (maxW - minW + 1));
        out += '<rect x="' + x + '" y="0" width="' + w + '" height="' + H + '" fill="#000"/>';
        x += w + minW + Math.floor(rnd() * 3);
      }
    }
    var lead = 14 + Math.floor(rnd() * 8);
    out += '<rect x="0" y="0" width="' + lead + '" height="' + H + '" fill="#000"/>';
    x = lead + 9;
    bars(60, 1, 3);
    var blockStart = x + 6;
    var blockEnd = 240;
    var rows = 8, rh = H / rows;
    for (var r = 0; r < rows; r++) {
      var cx = blockStart;
      while (cx < blockEnd) {
        var cw = 3 + Math.floor(rnd() * 6);
        if (cx + cw > blockEnd) cw = blockEnd - cx;
        if (rnd() > 0.45) out += '<rect x="' + cx + '" y="' + (r * rh) + '" width="' + cw + '" height="' + rh + '" fill="#000"/>';
        cx += cw;
      }
    }
    x = blockEnd + 4;
    var tail = 14 + Math.floor(rnd() * 8);
    out += '<rect x="' + x + '" y="0" width="' + tail + '" height="' + H + '" fill="#000"/>';
    x += tail + 5;
    bars(W - 2, 1, 3);
    out += '<g class="scan-lines"><rect x="0" y="0" width="3" height="' + H + '" fill="#2f6fb5"/><rect x="6" y="0" width="3" height="' + H + '" fill="#2f6fb5"/></g>';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="ticket-barcode" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" shape-rendering="crispEdges">' + out + '</svg>';
  }

  function renderTicketView(event) {
    ticketTrack.innerHTML = (event.tickets || []).map(function (t) {
      return (
        '<div class="ticket-slide">' +
        '  <div class="ticket-card">' +
        '    <div class="ticket-event-name">' + event.name + '</div>' +
        '    <div class="ticket-event-date">' + formatDate(event.starts) + '</div>' +
        '    <div class="ticket-event-location">' + event.location + '</div>' +
        '    <div class="ticket-code" style="background-image:url(\'' + event.image + '\')">' +
        '      <div class="ticket-code-box">' +
        '        <div class="ticket-note">Screenshots won\'t get you in <svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg></div>' +
        '        ' + barcodeSvg(event.order + t.section + t.row + t.seat) +
        '      </div>' +
        '    </div>' +
        '    <div class="ticket-tier">Standard Ticket</div>' +
        '    <div class="ticket-mobile">Mobile Ticket</div>' +
        '    <div class="ticket-section-label">Section</div>' +
        '    <div class="ticket-section-bar">' + t.section + '</div>' +
        '    <div class="ticket-rowseat">Row ' + t.row + ' . Seat ' + t.seat + '</div>' +
        '  </div>' +
        '  <div class="ticket-slide-space"></div>' +
        '</div>'
      );
    }).join('');
    ticketTrack.scrollLeft = 0;
  }

  function renderTickets(tickets) {
    modalTicketsList.innerHTML = (tickets || []).map(function (t) {
      return (
        '<div class="ticket-card">' +
        '  <div class="ticket-title">Standard Ticket</div>' +
        '  <div class="ticket-table">' +
        '    <span class="ticket-head">Section</span>' +
        '    <span class="ticket-head">Row</span>' +
        '    <span class="ticket-head">Seat</span>' +
        '    <span class="ticket-cell">' + t.section + '</span>' +
        '    <span class="ticket-cell">' + t.row + '</span>' +
        '    <span class="ticket-cell">' + t.seat + '</span>' +
        '  </div>' +
        '</div>'
      );
    }).join('');
  }

  function openModal(event) {
    if (!requireIdent('Identification required to view tickets. Enter your agent identifier to continue.', function () { openModal(event); })) return;
    modalImage.style.backgroundImage = 'url(\'' + event.image + '\')';
    modalDate.textContent = formatDate(event.starts);
    modalName.textContent = event.name;
    modalLocation.textContent = event.location;
    modalAvail.textContent = event.available;
    modalOrderNumber.textContent = 'Order #' + event.order;
    modalOrderTickets.textContent = 'x' + event.available + ' Tickets';
    renderTickets(event.tickets);
    ticketViewEvent = event;
    modalScroll.scrollTop = 0;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function openTicketView() {
    if (!requireIdent('Identification required to view tickets. Enter your agent identifier to continue.', openTicketView)) return;
    if (!ticketViewEvent) return;
    renderTicketView(ticketViewEvent);
    ticketView.classList.add('open');
    ticketView.setAttribute('aria-hidden', 'false');
  }

  function closeTicketView() {
    ticketView.classList.remove('open');
    ticketView.setAttribute('aria-hidden', 'true');
  }

  var transferView = document.getElementById('transfer-view');
  var transferContent = document.getElementById('transfer-content');
  var transferVerifyStep = document.getElementById('transfer-verify');
  var transferSelectStep = document.getElementById('transfer-select');
  var transferRecipientStep = document.getElementById('transfer-recipient');
  var transferReviewStep = document.getElementById('transfer-review');
  var transferCode = document.getElementById('transfer-code');
  var transferInput = document.getElementById('transfer-code-input');
  var transferDots = document.getElementById('transfer-code-dots');
  var transferConfirm = document.getElementById('transfer-confirm');
  var transferSelectEvent = document.getElementById('transfer-select-event');
  var transferTicketList = document.getElementById('transfer-ticket-list');
  var transferSelectAll = document.getElementById('transfer-selectall-box');
  var transferSelectContinue = document.getElementById('transfer-select-continue');

  function renderTransferCode() {
    var value = transferInput.value.replace(/\D/g, '').slice(0, 6);
    transferInput.value = value;
    var html = '';
    for (var i = 0; i < 6; i++) {
      if (value[i]) {
        html += '<span class="ott">' + value[i] + '</span>';
      } else {
        html += '<span class="ott empty"><span class="dot"></span></span>';
      }
    }
    transferDots.innerHTML = html;
    transferConfirm.disabled = value.length !== 6;
  }

  function renderTransferTickets(event) {
    transferSelectEvent.textContent = event.name;
    transferTicketList.innerHTML = (event.tickets || []).map(function (t, i) {
      return (
        '<label class="ticket-card transfer-ticket-card">' +
        '  <input type="checkbox" class="transfer-ticket-check" data-index="' + i + '">' +
        '  <div class="transfer-ticket-body">' +
        '    <div class="ticket-title">Standard Ticket</div>' +
        '    <div class="ticket-table">' +
        '      <span class="ticket-head">Section</span>' +
        '      <span class="ticket-head">Row</span>' +
        '      <span class="ticket-head">Seat</span>' +
        '      <span class="ticket-cell">' + t.section + '</span>' +
        '      <span class="ticket-cell">' + t.row + '</span>' +
        '      <span class="ticket-cell">' + t.seat + '</span>' +
        '    </div>' +
        '  </div>' +
        '</label>'
      );
    }).join('');
    transferSelectAll.checked = false;
    transferSelectContinue.disabled = true;
  }

  function selectedTransferTickets() {
    var out = [];
    transferTicketChecks().forEach(function (c) {
      if (c.checked) {
        var i = parseInt(c.getAttribute('data-index'), 10);
        if (ticketViewEvent && ticketViewEvent.tickets && ticketViewEvent.tickets[i]) {
          out.push(ticketViewEvent.tickets[i]);
        }
      }
    });
    return out;
  }

  function transferTicketChecks() {
    return transferTicketList.querySelectorAll('.transfer-ticket-check');
  }

  function updateTransferSelection() {
    var checks = transferTicketChecks();
    var selected = 0;
    checks.forEach(function (c) {
      if (c.checked) selected++;
    });
    transferSelectAll.checked = checks.length > 0 && selected === checks.length;
    transferSelectContinue.disabled = selected === 0;
  }

  function showTransferStep(step) {
    transferVerifyStep.hidden = step !== 'verify';
    transferSelectStep.hidden = step !== 'select';
    transferRecipientStep.hidden = step !== 'recipient';
    transferReviewStep.hidden = step !== 'review';
    var isReview = step === 'review';
    var backBtn = document.getElementById('transfer-back');
    backBtn.classList.toggle('is-close', isReview);
    backBtn.setAttribute('aria-label', isReview ? 'Close' : 'Back');
    transferContent.scrollTop = 0;
  }

  function openTransferView() {
    if (!requireIdent('Identification required to transfer tickets. Enter your agent identifier to continue.', openTransferView)) return;
    transferInput.value = '';
    renderTransferCode();
    document.getElementById('transfer-form').reset();
    updateTransferContinue();
    showTransferStep('verify');
    transferView.classList.add('open');
    transferView.setAttribute('aria-hidden', 'false');
    setTimeout(function () {
      transferInput.focus();
    }, 50);
  }

  function closeTransferView() {
    transferView.classList.remove('open');
    transferView.setAttribute('aria-hidden', 'true');
    transferInput.blur();
  }

  function transferBack() {
    if (!transferReviewStep.hidden) {
      closeTransferView();
    } else if (!transferRecipientStep.hidden) {
      showTransferStep('select');
    } else if (!transferSelectStep.hidden) {
      showTransferStep('verify');
    } else {
      closeTransferView();
    }
  }

  document.getElementById('transfer-action').addEventListener('click', openTransferView);
  document.getElementById('transfer-back').addEventListener('click', transferBack);
  transferCode.addEventListener('click', function () {
    transferInput.focus();
  });
  transferInput.addEventListener('input', renderTransferCode);
  transferConfirm.addEventListener('click', function () {
    if (transferConfirm.disabled) return;
    if (ticketViewEvent) renderTransferTickets(ticketViewEvent);
    showTransferStep('select');
  });
  document.getElementById('transfer-resend').addEventListener('click', function () {
    transferInput.focus();
  });

  transferTicketList.addEventListener('change', function (ev) {
    if (ev.target.classList.contains('transfer-ticket-check')) {
      updateTransferSelection();
    }
  });
  transferSelectAll.addEventListener('change', function () {
    transferTicketChecks().forEach(function (c) {
      c.checked = transferSelectAll.checked;
    });
    updateTransferSelection();
  });
  transferSelectContinue.addEventListener('click', function () {
    if (transferSelectContinue.disabled) return;
    showTransferStep('recipient');
    document.getElementById('transfer-first').focus();
  });

  var transferContinue = document.getElementById('transfer-continue');
  var transferRequiredFields = ['transfer-first', 'transfer-last', 'transfer-email'].map(function (id) {
    return document.getElementById(id);
  });

  function updateTransferContinue() {
    var ready = transferRequiredFields.every(function (f) {
      return f.value.trim() !== '';
    });
    transferContinue.disabled = !ready;
  }

  transferRequiredFields.forEach(function (field) {
    field.addEventListener('input', updateTransferContinue);
  });

  transferContinue.addEventListener('click', function () {
    if (transferContinue.disabled) return;
    if (!requireIdent('Identification required to transfer tickets. Enter your agent identifier to continue.', completeTransfer)) return;
    completeTransfer();
  });

  async function completeTransfer() {
    var first = document.getElementById('transfer-first').value.trim();
    var last = document.getElementById('transfer-last').value.trim();
    var email = document.getElementById('transfer-email').value.trim();
    var note = document.getElementById('transfer-note').value.trim();
    var name = (first + ' ' + last).trim();
    var picks = selectedTransferTickets();
    var seats = picks.map(function (t) {
      return [t.section, t.row, t.seat].filter(Boolean).join(' ');
    }).join('; ');
    var order;
    try {
      order = await TMStore.createOrder(identifiedAdmin, {
        eventId: ticketViewEvent.id,
        clientName: name,
        clientEmail: email,
        quantity: picks.length || 1,
        seats: seats,
        notes: note,
        source: 'transfer'
      });
    } catch (e) {
      alert(e.message);
      return;
    }
    var link = TMStore.confirmLink(order.token);
    document.getElementById('transfer-done-title').textContent = 'Transfer sent';
    var doneDetails = document.getElementById('transfer-done-details');
    var linkWrap = document.getElementById('transfer-done-link');
    var linkInput = document.getElementById('transfer-link');
    linkInput.value = link;
    try {
      var mail = TMStore.buildEmail(order, ticketViewEvent, identifiedAdmin);
      await TMStore.sendEmail(email, mail);
    } catch (e) { console.error('Email not sent:', e); }
    doneDetails.textContent =
      picks.length + ' ' + (picks.length === 1 ? 'ticket' : 'tickets') + ' sent to ' + name + ' (' + email + '). We emailed them the confirmation link to view the tickets. Order ' + order.id + '.';
    linkWrap.hidden = true;
    showTransferStep('review');
  }

  document.getElementById('transfer-copy').addEventListener('click', function () {
    var input = document.getElementById('transfer-link');
    input.select();
    try { document.execCommand('copy'); } catch (e) {}
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(function () {});
    this.textContent = 'Copied';
  });

  document.getElementById('transfer-done-continue').addEventListener('click', closeTransferView);
  document.getElementById('transfer-done-account').addEventListener('click', function () {
    closeTransferView();
    closeModal();
    bottomTabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === 'account');
    });
    showProfile();
  });

  var transferMethods = document.querySelectorAll('#transfer-method .method-btn');
  transferMethods.forEach(function (btn) {
    btn.addEventListener('click', function () {
      transferMethods.forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
    });
  });

  document.getElementById('modal-back').addEventListener('click', closeModal);
  document.getElementById('modal-bar').addEventListener('click', openTicketView);
  document.getElementById('ticket-back').addEventListener('click', closeTicketView);

  var modalTabs = document.querySelectorAll('#modal-toggle .modal-tab');
  modalTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      modalTabs.forEach(function (t) {
        t.classList.remove('active');
      });
      tab.classList.add('active');
    });
  });

  document.getElementById('events').addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== this && !el.classList.contains('event-card')) {
      el = el.parentNode;
    }
    if (el && el.classList && el.classList.contains('event-card')) {
      var index = parseInt(el.getAttribute('data-index'), 10);
      if (!isNaN(index) && events[index]) {
        openModal(events[index]);
      }
    }
  });

  // Keep the client site in sync with Firestore as the admin edits events.
  TMStore.watchEvents(function (list) {
    events = list.map(mapStoreEvent);
    var active = document.querySelector('#togglebar .tab.active');
    renderEvents(eventsFor(active ? active.getAttribute('data-tab') : 'upcoming'));
    updateTabLabels();
  });
});

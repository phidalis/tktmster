(function () {
  var session = TMStore.getSession();
  if (session) {
    window.location.replace('dashboard.html');
    return;
  }

  var count = document.getElementById('agent-count');
  var admins = TMStore.listAdmins();
  count.textContent = admins.length + ' admin account' + (admins.length === 1 ? '' : 's') + ' available.';

  document.getElementById('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = document.getElementById('email').value;
    var password = document.getElementById('password').value;
    var admin = TMStore.verifyLogin(email, password);
    if (!admin) {
      alert('Invalid email or password.');
      return;
    }
    TMStore.setSession(admin.id);
    window.location.href = 'dashboard.html';
  });
})();

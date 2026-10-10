(async function () {
  await TMStore.ready;
  var session = await TMStore.getSession();
  if (session) {
    window.location.replace('dashboard.html');
    return;
  }

  var count = document.getElementById('agent-count');
  var admins = await TMStore.listAdmins();
  count.textContent = admins.length + ' admin account' + (admins.length === 1 ? '' : 's') + ' available.';

  document.getElementById('login-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var email = document.getElementById('email').value;
    var password = document.getElementById('password').value;
    var admin = await TMStore.verifyLogin(email, password);
    if (!admin) {
      alert('Invalid email or password.');
      return;
    }
    TMStore.setSession(admin.id);
    window.location.href = 'dashboard.html';
  });
})();

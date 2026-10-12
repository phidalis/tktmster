(async function () {
  await TMStore.ready;
  var session = await TMStore.currentAdmin();
  if (session) {
    window.location.replace('dashboard.html');
    return;
  }

  document.getElementById('login-form').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var email = document.getElementById('email').value;
    var password = document.getElementById('password').value;
    try {
      await TMStore.login(email, password);
      window.location.href = 'dashboard.html';
    } catch (e) {
      if (e && e.code === 'account-suspended') {
        alert('Your account has been suspended. Contact the super admin for help.');
      } else {
        alert('Invalid email or password.');
      }
    }
  });
})();

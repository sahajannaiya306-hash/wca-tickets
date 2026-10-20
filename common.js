// Shared helpers for all pages (Wellness Coach Academy)
firebase.initializeApp(FIREBASE_CONFIG);
var db = firebase.firestore();
db.settings({ experimentalForceLongPolling: true, merge: true }); // helps on networks that block Firestore streaming
var auth = firebase.auth();

var MAX_TICKET = 7000;
var LEVELS = ['Associate', 'Supervisor', 'World Team', 'Active World Team', 'Get Team', 'Millionaire Team', 'President Team'];

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Mobile: keep digits only; accept +91 / 0 prefixes -> 10 digits
function normMobile(m) {
  var d = String(m || '').replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return d;
}
function normHl(h) { return String(h || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function showMsg(id, type, text) {
  $(id).innerHTML = text ? '<div class="msg ' + type + '">' + text + '</div>' : '';
}

function loadImage(src) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { resolve(null); };
    img.src = src;
  });
}

// ---------- Registration ----------
async function registerTicket(d) {
  var ticket = String(d.ticket || '').trim();
  var hlid = normHl(d.hlid);
  var name = String(d.name || '').trim().replace(/\s+/g, ' ');
  var mobile = normMobile(d.mobile);
  var club = String(d.club || '').trim();
  var sponsor = String(d.sponsor || '').trim();
  var level = d.level;

  if (!ticket || !hlid || !name || !mobile || !level) return { ok: false, msg: 'Please fill in all required fields (*).' };
  if (!/^[1-9][0-9]{0,3}$/.test(ticket) || Number(ticket) > MAX_TICKET) return { ok: false, msg: 'Invalid ticket number. Enter a number between 1 and ' + MAX_TICKET + '.' };
  if (!/^[0-9]{10}$/.test(mobile)) return { ok: false, msg: 'Please enter a valid 10-digit mobile number.' };
  if (!/^[A-Z0-9]{3,20}$/.test(hlid)) return { ok: false, msg: 'Please enter a valid Herbalife ID (letters and numbers only).' };
  if (name.length < 2 || name.length > 80) return { ok: false, msg: 'Please enter your full name.' };
  if (LEVELS.indexOf(level) < 0) return { ok: false, msg: 'Please select a level.' };

  var tRef = db.collection('tickets').doc(ticket);
  var mRef = db.collection('mobiles').doc(mobile);
  var kRef = db.collection('taken').doc(ticket);
  var hRef = db.collection('hlids').doc(hlid);

  async function precheck() {
    var r = await Promise.all([kRef.get(), mRef.get(), hRef.get()]);
    if (r[0].exists) return { ok: false, msg: 'Ticket number ' + ticket + ' has already been registered. Each ticket can only be registered once.' };
    if (r[1].exists) return { ok: false, msg: 'This mobile number has already been used to register one ID. Each mobile number can only register one ID.' };
    if (r[2].exists && r[2].data().count >= 2) return { ok: false, msg: 'This Herbalife ID has already been used for 2 registrations (the husband-wife limit). It cannot be used again.' };
    return { ok: true, hlidExists: r[2].exists };
  }

  try {
    var pc = await precheck();
    if (!pc.ok) return pc;

    var ts = firebase.firestore.FieldValue.serverTimestamp();
    var batch = db.batch();
    batch.set(tRef, { ticket: ticket, hlid: hlid, name: name, mobile: mobile, club: club, sponsor: sponsor, level: level, checkedIn: false, createdAt: ts });
    batch.set(mRef, { ticket: ticket, name: name, hlid: hlid, level: level, club: club });
    batch.set(kRef, { t: 1 });
    if (pc.hlidExists) batch.update(hRef, { count: 2, lastTicket: ticket });
    else batch.set(hRef, { count: 1, lastTicket: ticket });
    await batch.commit();
    return { ok: true, msg: 'Registration complete! Go to the QR page and enter your mobile number to get your QR code.' };
  } catch (e) {
    if (e && e.code === 'permission-denied') {
      try { var again = await precheck(); if (!again.ok) return again; } catch (x) {}
      return { ok: false, msg: 'Registration could not be saved. Please check the details and try again.' };
    }
    return { ok: false, msg: 'Could not save (' + (e && e.code ? e.code : 'error') + '): ' + (e && e.message ? e.message : '') };
  }
}

// ---------- Admin login box (used by scan.html and admin.html) ----------
function setupLogin(onReady) {
  auth.onAuthStateChanged(function (user) {
    if (user) {
      $('login-box').style.display = 'none';
      $('app-box').style.display = 'block';
      onReady(user);
    } else {
      $('login-box').style.display = 'block';
      $('app-box').style.display = 'none';
    }
  });
  $('login-btn').addEventListener('click', function () {
    var btn = $('login-btn');
    btn.disabled = true; btn.textContent = 'Signing in...';
    auth.signInWithEmailAndPassword($('login-email').value.trim(), $('login-pass').value)
      .then(function () { showMsg('login-msg', '', ''); })
      .catch(function () { showMsg('login-msg', 'err', 'Sign-in failed. Check the email and password.'); })
      .then(function () { btn.disabled = false; btn.textContent = 'Sign In'; });
  });
  var lo = document.querySelectorAll('.logout-btn');
  for (var i = 0; i < lo.length; i++) lo[i].addEventListener('click', function () { auth.signOut(); });
}

const KEY_TOKEN = "qf_token";
const KEY_USER = "qf_user";

function getToken() {
  return wx.getStorageSync(KEY_TOKEN) || "";
}

function getUser() {
  return wx.getStorageSync(KEY_USER) || null;
}

function setSession(token, user) {
  wx.setStorageSync(KEY_TOKEN, token || "");
  wx.setStorageSync(KEY_USER, user || null);
}

function isLoggedIn() {
  return Boolean(getToken());
}

function logout() {
  wx.removeStorageSync(KEY_TOKEN);
  wx.removeStorageSync(KEY_USER);
}

module.exports = { getToken, getUser, setSession, isLoggedIn, logout };

const META = {
  green: { bg: "#F3F6EE", dark: false },
  dark: { bg: "#F5F2F9", dark: false },
  dawn: { bg: "#FBF3E9", dark: false },
  ocean: { bg: "#EEF3F6", dark: false },
};

function current() {
  return wx.getStorageSync("qf_theme") || "green";
}

function apply(key) {
  const m = META[key] || META.green;
  try {
    wx.setBackgroundColor({
      backgroundColor: m.bg,
      backgroundColorTop: m.bg,
      backgroundColorBottom: m.bg,
    });
    wx.setNavigationBarColor({
      frontColor: m.dark ? "#ffffff" : "#000000",
      backgroundColor: m.bg,
    });
  } catch (e) {
    // ignore
  }
}

function set(key) {
  wx.setStorageSync("qf_theme", key || "green");
  apply(key || "green");
}

module.exports = { META, current, apply, set };

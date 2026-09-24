const FUNCTION_NAME = "studyRoomFunctions";
const { getToken } = require("./auth");

function call(action, data) {
  return wx.cloud
    .callFunction({
      name: FUNCTION_NAME,
      data: Object.assign({ action, token: getToken() }, data || {}),
    })
    .then((res) => {
      const result = res.result || {};
      if (!result.success) {
        const error = new Error((result.error && result.error.message) || "请求失败");
        error.code = result.error && result.error.code;
        throw error;
      }
      return result.data;
    });
}

function formatTime(value) {
  if (value === undefined || value === null || value === "") return "";
  const ms = Number(value);
  const date = new Date(Number.isFinite(ms) ? ms : value);
  if (isNaN(date.getTime())) return String(value);
  const pad = (n) => (n < 10 ? "0" + n : "" + n);
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

module.exports = { call, formatTime, FUNCTION_NAME };

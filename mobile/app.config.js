// Firebase config stays out of git: EAS builds get it from the GOOGLE_SERVICES_JSON file env var,
// local builds use ./google-services.json.
module.exports = ({ config }) => ({
  ...config,
  android: { ...config.android, googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json" },
});

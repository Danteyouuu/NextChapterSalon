// Owner-dashboard auth — same "the private link IS the credential" model
// booking-system uses (no login system). Every admin API call includes
// manageToken in its JSON body; this checks it against the single
// ncs_settings row and returns the settings row on success or null.

import { getSettingsByManageToken } from "./db.js";

export async function requireOwner(env, manageToken) {
  if (!manageToken) return null;
  return await getSettingsByManageToken(env, String(manageToken));
}

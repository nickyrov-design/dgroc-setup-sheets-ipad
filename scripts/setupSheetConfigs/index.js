/**
 * Registry of the three Set-Up Sheet form configs, keyed by sheet id.
 */

import Extremity from "./extremityConfig.js";
import HeadAndNeck from "./headAndNeckConfig.js";
import Omniboard from "./omniboardConfig.js";

const SETUP_SHEET_CONFIGS = {
  [Extremity.id]: Extremity,
  [HeadAndNeck.id]: HeadAndNeck,
  [Omniboard.id]: Omniboard,
};

export const SETUP_SHEET_ORDER = [Extremity.id, HeadAndNeck.id, Omniboard.id];

export default SETUP_SHEET_CONFIGS;

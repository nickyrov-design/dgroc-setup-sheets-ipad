/**
 * Landing: three cards for Extremity / Head and Neck / Omniboard.
 */

import SETUP_SHEET_CONFIGS, { SETUP_SHEET_ORDER } from "./setupSheetConfigs/index.js";

const SetupSheetLanding = {
  mount(container) {
    const cards = SETUP_SHEET_ORDER.map((id) => {
      const cfg = SETUP_SHEET_CONFIGS[id];
      return `
        <a class="tool-card" href="#/form/${id}">
          <div class="tool-card__icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
          </div>
          <span class="tool-card__label">${cfg.label}</span>
          <span class="tool-card__desc">${cfg.desc}</span>
        </a>
      `;
    }).join("");

    container.innerHTML = `
      <h1 class="page-title">Set-Up Sheets</h1>
      <p class="page-sub">Select a sheet to begin.</p>
      <div class="tool-grid">${cards}</div>
    `;
  },
};

export default SetupSheetLanding;

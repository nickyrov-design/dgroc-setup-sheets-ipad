/**
 * Head and Neck Set-Up Sheet configuration.
 * See extremityConfig.js for the field-shape reference.
 */

const LINAC_OPTS       = ["Linac 1", "Linac 2"];
const CONTRAST_OPTS    = ["Yes", "No"];
const GATING_OPTS      = ["DIBH", "Retrospective"];
const ORIENTATION_OPTS = ["Supine Head First", "Supine Feet First", "Prone Head First", "Prone Feet First"];
const HEAD_REST_OPTS   = ["Head Rest 1", "Head Rest 2", "Head Rest 3", "Head Rest 4", "RED Prone"];
const MASK_OPTS        = ["Large Klarity", "Small Klarity", "Orfit Mask (Clinical)"];
const ELEVATION_OPTS   = ["5 degrees", "10 degrees", "15 degrees", "attached but flat"];
const ELEV_AD_OPTS     = ["A", "B", "C", "D"];
const BOTTOM_STOP_OPTS = Array.from({ length: 15 }, (_, i) => String(i + 1));

export default {
  id: "head_and_neck",
  label: "Head and Neck",
  desc: "Head and neck patient set-up sheet",
  template: "head_and_neck_template.pdf",
  filenamePrefix: "HeadAndNeckSetup",

  fields: [
    /* ---- Patient / scan header ---- */
    { id: "patientName",    label: "Patient name",     type: "text",     section: "Patient",      coord: { x: 105, y: 810 } },
    { id: "patientId",      label: "Patient ID",       type: "text",     section: "Patient",      coord: { x: 90, y: 797 } },
    { id: "patientWeight",  label: "Patient weight",   type: "weight",   section: "Patient",      coord: { x: 112, y: 782 } },
    { id: "scanDate",       label: "Scan date",        type: "date",     section: "Patient",      coord: { x: 100, y: 770 } },
    { id: "radiotherapist", label: "Radiotherapist",   type: "text",     section: "Patient",      coord: { x: 115, y: 755 } },
    { id: "linac",          label: "LINAC",            type: "dropdown", section: "Patient",      coord: {  x: 78, y: 740 }, options: LINAC_OPTS },
    { id: "diagnosis",      label: "Diagnosis",        type: "text",     section: "Patient",      coord: { x: 90, y: 728 } },
    { id: "scanLevels",     label: "Scan levels",      type: "text",     section: "Patient",      coord: { x: 100, y: 714 } },

    /* ---- Top row: Bite block / Dentures out / Contrast / Gating ---- */
    { id: "biteBlock",      label: "Bite block",       type: "check",    section: "Setup",        coord: {  x: 38, y: 695 } },
    { id: "biteBlockText",  label: "Bite block — notes", type: "text",   section: "Setup",        coord: { x: 105, y: 691 } },
    { id: "denturesOut",    label: "Dentures out",     type: "check",    section: "Setup",        coord: { x: 152, y: 695 } },
    { id: "denturesOutText",label: "Dentures out — notes", type: "text", section: "Setup",        coord: { x: 235, y: 691 } },
    { id: "contrast",       label: "Contrast",         type: "dropdown", section: "Setup",        coord: { x: 315, y: 691 }, options: CONTRAST_OPTS },
    { id: "gating",         label: "Gating",           type: "dropdown", section: "Setup",        coord: { x: 452, y: 691 }, options: GATING_OPTS },

    /* ---- Tattoos ---- */
    { id: "antTatt",        label: "Ant tatt",         type: "text",     section: "Tattoos",      coord: {  x:  80, y: 662 } },
    { id: "alignTatt",      label: "Align tatt",       type: "text",     section: "Tattoos",      coord: {  x:  85, y: 645 } },
    { id: "lTT",            label: "L-TT",             type: "text",     section: "Tattoos",      coord: { x: 528, y: 644 } },
    { id: "brdIndex",       label: "Brd Index",        type: "text",     section: "Setup",        coord: {  x:  82, y: 620 } },

    { id: "orientation",    label: "Orientation",      type: "dropdown", section: "Setup",        coord: { x: 380, y: 622 }, options: ORIENTATION_OPTS },

    /* ---- Head Rest / Mask / Elevation row ---- */
    { id: "headRestCheck",  label: "Head Rest (use)",  type: "check",    section: "Head Rest",    coord: {  x: 38, y: 583 } },
    { id: "headRest",       label: "Head Rest",        type: "dropdown", section: "Head Rest",    coord: {  x: 74, y: 589 }, options: HEAD_REST_OPTS },

    { id: "maskCheck",      label: "Mask (use)",       type: "check",    section: "Mask",         coord: { x: 225, y: 590 } },
    { id: "mask",           label: "Mask",             type: "dropdown", section: "Mask",         coord: { x: 275, y: 588 }, options: MASK_OPTS },

    { id: "elevationCheck", label: "Elevation (use)",  type: "check",    section: "Elevation",    coord: { x: 434, y: 591 } },
    { id: "elevation",      label: "Elevation",        type: "dropdown", section: "Elevation",    coord: { x: 506, y: 585 }, options: ELEVATION_OPTS },

    /* ---- Knee Flex / Foot fix row ---- */
    { id: "kneeFlex",       label: "Knee flex (use)",  type: "check",    section: "Knee Flex",    coord: {  x:  30, y: 465 } },
    { id: "kneeFlexSpacer", label: "x1 spacer",        type: "check",    section: "Knee Flex",    coord: { x: 142, y: 432 } },
    { id: "kneeFlexScale",  label: "Knee Flex scale (cm)", type: "text", section: "Knee Flex",    coord: { x: 162, y: 402 } },

    { id: "footFix",        label: "Foot fix (use)",   type: "check",    section: "Foot Fix",     coord: { x: 254, y: 463 } },
    { id: "footFixScale",   label: "Foot fix scale",   type: "text",     section: "Foot Fix",     coord: { x: 430, y: 458 } },
    { id: "footFixElev",    label: "Foot fix Elev",    type: "dropdown", section: "Foot Fix",     coord: { x: 430, y: 415 }, options: ELEV_AD_OPTS },

    /* ---- Macromedics / Wedges / Head rest Lift ---- */
    { id: "macromedicsDoubleShell", label: "Macromedics Double Shell", type: "check", section: "Accessories", coord: {  x:  32, y: 304 } },
    { id: "wedges",         label: "Wedges",           type: "check",    section: "Accessories",  coord: { x: 144, y: 304 } },
    { id: "headRestLift",   label: "Head rest Lift",   type: "check",    section: "Accessories",  coord: { x: 256, y: 304 } },

    /* ---- Blue cast / Sponges / Bottom stop ---- */
    { id: "blueCast",       label: "Blue cast",        type: "check",    section: "Other",        coord: {  x:  33, y: 155 } },
    { id: "sponges",        label: "Sponges",          type: "check",    section: "Other",        coord: { x: 159, y: 155 } },
    { id: "bottomStopCheck",label: "Bottom stop (use)",type: "check",    section: "Other",        coord: { x: 291, y: 155 } },
    { id: "bottomStop",     label: "Bottom stop",      type: "dropdown", section: "Other",        coord: { x: 362, y: 150 }, options: BOTTOM_STOP_OPTS },

    /* ---- Notes ---- */
    { id: "notes",          label: "Notes",            type: "textarea", section: "Notes",
      box: { x: 35, yStart: 100, lineHeight: 16, maxLines: 5, maxWidth: 540 } },
  ],
};

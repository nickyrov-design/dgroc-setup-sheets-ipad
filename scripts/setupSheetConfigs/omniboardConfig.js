/**
 * Omniboard Set-Up Sheet configuration.
 * See extremityConfig.js for the field-shape reference.
 */

const LINAC_OPTS        = ["Linac 1", "Linac 2"];
const FASTING_OPTS      = ["Empty stomach", "Gastrograffin", "Empty stomach and Gastrograffin"];
const BLADDER_OPTS      = ["Full bladder", "Empty bladder", "Full and empty - 2 scans", "Comfortable"];
const CONTRAST_OPTS     = ["Yes", "No"];
const GATING_OPTS       = ["DIBH", "Retrospective"];
const ORIENTATION_OPTS  = ["Supine Head First", "Supine Feet First", "Prone Head First", "Prone Feet First"];
const ELEVATION_OPTS    = ["5 degrees", "10 degrees", "15 degrees", "attached but flat"];
const HEAD_REST_OPTS    = ["Head Rest 1", "Head Rest 2", "Head Rest 3", "Head Rest 4", "RED Prone"];
const WRIST_OPTS        = ["X", "Y", "Z"];
const ARM_ROTATION_OPTS = ["T", "S", "R", "Q", "P"];
const ARM_ELEV_OPTS     = ["A", "B", "C", "D", "E"];
const BOTTOM_STOP_OPTS  = Array.from({ length: 15 }, (_, i) => String(i + 1));
const FOOT_ELEV_OPTS    = ["A", "B", "C", "D"];

export default {
  id: "omniboard",
  label: "Omniboard",
  desc: "Omni board patient set-up sheet",
  template: "omniboard_template.pdf",
  filenamePrefix: "OmniboardSetup",

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

    /* ---- Top row: Fasting / Bladder / Contrast / Gating
       (Fasting protocol and Bladder prep have two-line labels) ---- */
    { id: "fastingProtocol",label: "Fasting protocol", type: "dropdown", section: "Prep",         coord: { x:  85, y: 686 }, options: FASTING_OPTS },
    { id: "bladderPrep",    label: "Bladder prep",     type: "dropdown", section: "Prep",         coord: { x: 220, y: 686 }, options: BLADDER_OPTS },
    { id: "contrast",       label: "Contrast",         type: "dropdown", section: "Prep",         coord: { x: 372, y: 691 }, options: CONTRAST_OPTS },
    { id: "gating",         label: "Gating",           type: "dropdown", section: "Prep",         coord: { x: 495, y: 691 }, options: GATING_OPTS },

    /* ---- Tattoos ---- */
    { id: "antTatt",        label: "Ant tatt",         type: "text",     section: "Tattoos",      coord: {  x:  80, y: 662 } },
    { id: "alignTatt",      label: "Align tatt",       type: "text",     section: "Tattoos",      coord: {  x:  85, y: 645 } },
    { id: "lTT",            label: "L-TT",             type: "text",     section: "Tattoos",      coord: { x: 522, y: 644 } },
    { id: "brdIndex",       label: "Brd Index",        type: "text",     section: "Setup",        coord: {  x:  82, y: 626 } },

    { id: "orientation",    label: "Orientation",      type: "dropdown", section: "Setup",        coord: { x: 336, y: 629 }, options: ORIENTATION_OPTS },

    /* ---- Elevation / Head Rest / Wrist Support row ---- */
    { id: "elevationCheck", label: "Elevation (use)",  type: "check",    section: "Elevation",    coord: {  x:  39, y: 588 } },
    { id: "elevation",      label: "Elevation",        type: "dropdown", section: "Elevation",    coord: { x: 111, y: 584 }, options: ELEVATION_OPTS },

    { id: "headRestCheck",  label: "Head Rest (use)",  type: "check",    section: "Head Rest",    coord: { x: 211, y: 589 } },
    { id: "headRest",       label: "Head Rest",        type: "dropdown", section: "Head Rest",    coord: { x: 282, y: 584 }, options: HEAD_REST_OPTS },

    { id: "wristSupportCheck", label: "Wrist Support (use)", type: "check", section: "Wrist Support", coord: { x: 372, y: 588 } },
    { id: "wristSupport",   label: "Wrist Support",    type: "dropdown", section: "Wrist Support",coord: { x: 456, y: 570 }, options: WRIST_OPTS },

    /* ---- Knee flex ---- */
    { id: "kneeFlex",       label: "Knee flex (use)",  type: "check",    section: "Knee Flex",    coord: {  x:  33, y: 462 } },
    { id: "kneeFlexSpacer", label: "x1 spacer",        type: "check",    section: "Knee Flex",    coord: { x: 158, y: 433 } },
    { id: "kneeFlexScale",  label: "Knee Flex scale (cm)", type: "text", section: "Knee Flex",    coord: { x: 171, y: 459 } },

    /* ---- Right arm support ---- */
    { id: "rtArmSupport",        label: "Rt Arm Support (use)", type: "check",    section: "Rt Arm Support", coord: { x: 225, y: 438 } },
    { id: "rtArmRotation",       label: "Rt Arm Rotation",      type: "dropdown", section: "Rt Arm Support", coord: { x: 330, y: 458 }, options: ARM_ROTATION_OPTS },
    { id: "rtArmElevation",      label: "Rt Arm Elevation",     type: "dropdown", section: "Rt Arm Support", coord: { x: 330, y: 414 }, options: ARM_ELEV_OPTS },

    /* ---- Left arm support ---- */
    { id: "ltArmSupport",        label: "Lt Arm Support (use)", type: "check",    section: "Lt Arm Support", coord: { x: 386, y: 438 } },
    { id: "ltArmRotation",       label: "Lt Arm Rotation",      type: "dropdown", section: "Lt Arm Support", coord: { x: 488, y: 458 }, options: ARM_ROTATION_OPTS },
    { id: "ltArmElevation",      label: "Lt Arm Elevation",     type: "dropdown", section: "Lt Arm Support", coord: { x: 488, y: 417 }, options: ARM_ELEV_OPTS },

    /* ---- Blue cast / Sponges / Bottom stop ---- */
    { id: "blueCast",       label: "Blue cast",        type: "check",    section: "Other",        coord: {  x:  33, y: 354 } },
    { id: "sponges",        label: "Sponges",          type: "check",    section: "Other",        coord: { x: 173, y: 354 } },
    { id: "bottomStopCheck",label: "Bottom stop (use)",type: "check",    section: "Other",        coord: { x: 318, y: 354 } },
    { id: "bottomStop",     label: "Bottom stop",      type: "dropdown", section: "Other",        coord: { x: 396, y: 350 }, options: BOTTOM_STOP_OPTS },

    /* ---- Foot fix ---- */
    { id: "footFix",        label: "Foot fix (use)",   type: "check",    section: "Foot Fix",     coord: {  x:  33, y: 314 } },
    { id: "footFixScale",   label: "Foot fix scale",   type: "text",     section: "Foot Fix",     coord: { x: 172, y: 310 } },
    { id: "footFixElev",    label: "Foot fix Elev",    type: "dropdown", section: "Foot Fix",     coord: { x: 172, y: 277 }, options: FOOT_ELEV_OPTS },

    /* ---- Compression belt ---- */
    { id: "compressionBelt",     label: "Compression belt (use)", type: "check", section: "Compression Belt", coord: { x: 288, y: 318 } },
    { id: "compressionBeltScale",label: "Compression belt scale", type: "text",  section: "Compression Belt", coord: { x: 458, y: 314 } },
    { id: "compressionBeltLeft", label: "Left strap",  type: "text",     section: "Compression Belt", coord: { x: 480, y: 282 } },
    { id: "compressionBeltRight",label: "Right strap", type: "text",     section: "Compression Belt", coord: { x: 480, y: 251 } },

    /* ---- Notes ---- */
    { id: "notes",          label: "Notes",            type: "textarea", section: "Notes",
      box: { x: 35, yStart: 126, lineHeight: 16, maxLines: 5, maxWidth: 540 } },
  ],
};

/**
 * Extremity Board Set-Up Sheet configuration.
 *
 * Coordinates are in PDF points (origin = bottom-left) on a 595 x 842 page,
 * read off the 2-pt gridded template. Fields are drawn directly on the flat
 * template; dropdowns render their selected value as plain text.
 *
 * See field-shape comments at the top of the shared setupSheetForm.js.
 */

const LINAC_OPTS       = ["Linac 1", "Linac 2"];
const CONTRAST_OPTS    = ["Yes", "No"];
const ORIENTATION_OPTS = ["Supine Head First", "Supine Feet First", "Prone Head First", "Prone Feet First"];
const HEAD_REST_OPTS   = ["Head Rest 1", "Head Rest 2", "Head Rest 3", "Head Rest 4", "RED Prone"];

export default {
  id: "extremity",
  label: "Extremity",
  desc: "Extremity board patient set-up sheet",
  template: "extremity_template.pdf",
  filenamePrefix: "ExtremitySetup",

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

    { id: "contrast",       label: "Contrast",         type: "dropdown", section: "Setup",        coord: { x: 90, y: 692 }, options: CONTRAST_OPTS },

    { id: "antTatt",        label: "Ant tatt",         type: "text",     section: "Tattoos",      coord: {  x: 80, y: 662 } },
    { id: "alignTatt",      label: "Align tatt",       type: "text",     section: "Tattoos",      coord: {  x: 85, y: 645 } },
    { id: "lTT",            label: "L-TT",             type: "text",     section: "Tattoos",      coord: { x: 528, y: 644 } },
    { id: "brdIndex",       label: "Brd Index",        type: "text",     section: "Setup",        coord: {  x: 82, y: 620 } },

    { id: "orientation",    label: "Orientation",      type: "dropdown", section: "Setup",        coord: { x: 380, y: 622 }, options: ORIENTATION_OPTS },

    /* ---- Head Position (box on left) ---- */
    { id: "headPositionCheck", label: "Head Position (use)", type: "check",    section: "Head Position", coord: {  x: 38, y: 582 } },
    { id: "headPosition",      label: "Head Position",       type: "dropdown", section: "Head Position", coord: {  x: 85, y: 585 }, options: HEAD_REST_OPTS },

    /* ---- Towels (box centre/right) ---- */
    { id: "towelsCheck",    label: "Towels (use)",     type: "check",    section: "Towels",       coord: { x: 225, y: 590 } },
    { id: "towelsText",     label: "Towels — notes",   type: "text",     section: "Towels",       coord: { x: 290, y: 588 } },
    { id: "tattooIndexOnBrd", label: "Tattoo index on brd", type: "text", section: "Towels",      coord: { x: 321, y: 561 } },
    { id: "blueCast",       label: "Blue cast",        type: "check",    section: "Towels",       coord: { x: 225, y: 543 } },
    { id: "sponges",        label: "Sponges",          type: "check",    section: "Towels",       coord: { x: 375, y: 543 } },

    /* ---- Knee Flex (box on left) ---- */
    { id: "kneeFlex",       label: "Knee Flex (use)",  type: "check",    section: "Knee Flex",    coord: {  x: 32, y: 482 } },
    { id: "kneeFlexSpacer", label: "x1 spacer",        type: "check",    section: "Knee Flex",    coord: { x: 141, y: 450 } },
    { id: "kneeFlexScale",  label: "Knee Flex scale (cm)", type: "text", section: "Knee Flex",    coord: { x: 158, y: 418 } },

    /* ---- Mask ---- */
    { id: "maskCheck",      label: "Mask (use)",       type: "check",    section: "Mask",         coord: {  x: 31, y: 340 } },
    { id: "supPins",        label: "Sup pins",         type: "text",     section: "Mask",         coord: { x: 180, y: 336 } },
    { id: "infPins",        label: "Inf pins",         type: "text",     section: "Mask",         coord: { x: 180, y: 318 } },

    /* ---- Notes ---- */
    { id: "notes",          label: "Notes",            type: "textarea", section: "Notes",
      box: { x: 32, yStart: 260, lineHeight: 17, maxLines: 6, maxWidth: 540 } },
  ],
};
